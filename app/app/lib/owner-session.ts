"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@supabase/supabase-js"

export type VerifiedOwner = { id: string; email: string }
export type OwnerSessionPhase = "checking" | "signed_out" | "sending" | "code_sent" | "verifying" | "signed_in"
export type OwnerSessionState = {
  owner: VerifiedOwner | null
  phase: OwnerSessionPhase
  pendingEmail: string
  error: string | null
  epoch: number
}

type AuthSession = { access_token: string }
type AuthResult = { data: { session: AuthSession | null }; error: { message: string } | null }
export interface OwnerAuthPort {
  getSession(): Promise<AuthResult>
  signInWithOtp(credentials: { email: string; options: { shouldCreateUser: boolean } }): Promise<{ error: { message: string } | null }>
  verifyOtp(credentials: { email: string; token: string; type: "email" }): Promise<AuthResult>
  signOut(options: { scope: "local" }): Promise<{ error: { message: string } | null }>
  clearLocalSession?(): void | Promise<void>
  onAuthStateChange(callback: (event: string, session: AuthSession | null) => void): { data: { subscription: { unsubscribe(): void } } }
}

const INITIAL_STATE: OwnerSessionState = { owner: null, phase: "checking", pendingEmail: "", error: null, epoch: 0 }

export class StaleOwnerSessionError extends Error {
  constructor() { super("The signed-in account changed. Retry from the current account."); this.name = "StaleOwnerSessionError" }
}

/** Auth tokens are transport credentials only. Owner identity comes from the server's getUser boundary. */
export class OwnerSessionController {
  private state: OwnerSessionState = { ...INITIAL_STATE }
  private listeners = new Set<(state: OwnerSessionState) => void>()
  private activeRequests = new Set<AbortController>()
  private verifiedToken = ""
  private revision = 0
  private flowRevision = 0
  private subscription: { unsubscribe(): void } | null = null
  private subscriptionRevision = 0
  private started = false
  private acceptAuthEvents = true
  private sendingFlow: number | null = null
  private verifyingFlow: number | null = null
  private pendingVerification: { token: string; promise: Promise<void> } | null = null
  private auth: OwnerAuthPort
  private fetcher: typeof fetch
  private origin: string

  constructor(auth: OwnerAuthPort, fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init), origin = "http://localhost") { this.auth = auth; this.fetcher = fetcher; this.origin = origin }

  getState = (): OwnerSessionState => this.state
  isCurrentOwner = (ownerId: string, epoch?: number): boolean => Boolean(ownerId && this.state.owner?.id === ownerId && (epoch === undefined || this.state.epoch === epoch))
  subscribe = (listener: (state: OwnerSessionState) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(values: Partial<OwnerSessionState>) { this.state = { ...this.state, ...values }; for (const listener of this.listeners) listener(this.state) }
  private assertCurrent(epoch: number, ownerId: string) {
    if (epoch !== this.state.epoch || ownerId !== this.state.owner?.id) throw new StaleOwnerSessionError()
  }
  private invalidate(values: Partial<OwnerSessionState> = {}) {
    this.revision += 1
    this.verifiedToken = ""
    this.pendingVerification = null
    for (const request of this.activeRequests) request.abort()
    this.activeRequests.clear()
    this.update({ owner: null, phase: "signed_out", pendingEmail: "", error: null, epoch: this.state.epoch + 1, ...values })
  }

  async start() {
    if (this.started) return
    this.started = true
    const subscriptionRevision = ++this.subscriptionRevision
    this.subscription = this.auth.onAuthStateChange((event, session) => {
      if (!this.started || subscriptionRevision !== this.subscriptionRevision) return
      if (event === "SIGNED_OUT") {
        // SDK session cleanup can arrive while an unauthenticated email challenge is pending.
        // Always revoke private access while retaining only the unauthenticated send/code-entry state.
        if (!this.state.owner && this.state.pendingEmail && ["sending", "code_sent"].includes(this.state.phase)) {
          const { phase, pendingEmail, error } = this.state
          this.acceptAuthEvents = false
          this.invalidate({ phase, pendingEmail, error })
        } else {
          this.flowRevision += 1
          this.invalidate()
        }
        return
      }
      // Do not await auth SDK calls while its auth-state callback holds the SDK lock.
      if (this.acceptAuthEvents && session?.access_token) {
        if (event === "SIGNED_IN" && this.state.owner && session.access_token !== this.verifiedToken) this.invalidate({ phase: "checking" })
        const flow = this.flowRevision
        const epoch = this.state.epoch
        queueMicrotask(() => { if (this.started && subscriptionRevision === this.subscriptionRevision && this.acceptAuthEvents && flow === this.flowRevision && epoch === this.state.epoch) void this.verifySession(session).catch(() => {}) })
      }
    }).data.subscription
    const revision = this.revision
    try {
      const result = await this.auth.getSession()
      if (revision !== this.revision) return
      if (result.error) throw new Error(result.error.message)
      if (!result.data.session) { this.update({ phase: "signed_out" }); return }
      await this.verifySession(result.data.session)
    } catch (error) {
      if (revision === this.revision) this.invalidate({ error: error instanceof Error ? error.message : "Unable to verify your account." })
    }
  }

  /** Invalidates pending callbacks and requests without deleting another session's data. */
  stop() {
    this.started = false
    this.subscriptionRevision += 1
    this.subscription?.unsubscribe()
    this.subscription = null
    this.flowRevision += 1
    this.invalidate()
  }

  private verifySession(session: AuthSession): Promise<void> {
    const token = session.access_token
    if (!token) { this.invalidate(); return Promise.reject(new Error("Sign in to continue.")) }
    if (token === this.verifiedToken && this.state.owner) return Promise.resolve()
    if (this.pendingVerification?.token === token) return this.pendingVerification.promise
    const revision = ++this.revision
    const controller = new AbortController()
    this.activeRequests.add(controller)
    this.update({ phase: "checking", error: null })
    const promise = (async () => {
      try {
        const response = await this.fetcher("/api/auth/session", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin", redirect: "error", signal: controller.signal,
        })
        if (revision !== this.revision) throw new StaleOwnerSessionError()
        const data = await response.json()
        if (revision !== this.revision) throw new StaleOwnerSessionError()
        if (!response.ok || typeof data?.owner?.id !== "string" || !data.owner.id || typeof data?.owner?.email !== "string" || !data.owner.email) {
          throw new Error("Your session could not be verified. Sign in again.")
        }
        const owner: VerifiedOwner = { id: data.owner.id, email: data.owner.email }
        if (this.state.owner && owner.id !== this.state.owner.id) {
          // A token refresh must never carry an old owner's responses into a different account.
          this.invalidate()
        }
        this.verifiedToken = token
        this.update({ owner, phase: "signed_in", pendingEmail: "", error: null })
      } catch (error) {
        if (revision === this.revision) this.invalidate({ error: error instanceof Error ? error.message : "Unable to verify your account." })
        throw error
      } finally {
        this.activeRequests.delete(controller)
        if (this.pendingVerification?.token === token && revision === this.revision) this.pendingVerification = null
      }
    })()
    this.pendingVerification = { token, promise }
    return promise
  }

  signIn = async (input: string) => {
    const email = input.trim().toLowerCase()
    // Guard before notifying React or calling Auth: repeated form callbacks can precede a render.
    if (this.sendingFlow === this.flowRevision || this.verifyingFlow === this.flowRevision || (this.state.phase === "code_sent" && email === this.state.pendingEmail)) return
    this.flowRevision += 1
    this.acceptAuthEvents = false
    const flow = this.flowRevision
    this.sendingFlow = flow
    this.invalidate({ phase: "sending", pendingEmail: email })
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.update({ phase: "signed_out", error: "Enter a valid account email." }); return }
      const result = await this.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      if (flow !== this.flowRevision) return
      if (result.error) throw new Error(result.error.message)
      this.update({ phase: "code_sent", error: null })
    } catch (error) {
      if (flow === this.flowRevision) this.update({ phase: "signed_out", error: error instanceof Error ? error.message : "Unable to send a sign-in code." })
    } finally {
      // A cancelled older request must not release a newer flow's guard.
      if (this.sendingFlow === flow) this.sendingFlow = null
    }
  }

  verify = async (input: string) => {
    const email = this.state.pendingEmail
    if (!email || this.state.phase !== "code_sent" || this.verifyingFlow === this.flowRevision) return
    const flow = this.flowRevision
    this.verifyingFlow = flow
    this.acceptAuthEvents = true
    this.update({ phase: "verifying", error: null })
    try {
      const result = await this.auth.verifyOtp({ email, token: input.trim(), type: "email" })
      if (flow !== this.flowRevision) return
      if (result.error) throw new Error(result.error.message)
      if (!result.data.session) throw new Error("No sign-in session was returned. Request another code.")
      await this.verifySession(result.data.session)
    } catch (error) {
      if (flow === this.flowRevision && !this.state.owner) this.update({ phase: "code_sent", pendingEmail: email, error: error instanceof Error ? error.message : "Unable to verify your code." })
    } finally {
      if (this.verifyingFlow === flow) this.verifyingFlow = null
    }
  }

  signOut = async () => {
    this.acceptAuthEvents = false
    this.flowRevision += 1
    const flow = this.flowRevision
    this.invalidate({ phase: "checking" })
    try {
      const result = await this.auth.signOut({ scope: "local" })
      if (result.error && flow === this.flowRevision) {
        await this.auth.clearLocalSession?.()
        this.update({ phase: "signed_out", error: "Signed out on this device. The authentication service could not confirm session revocation." })
      } else if (flow === this.flowRevision) this.update({ phase: "signed_out" })
    } catch {
      if (flow === this.flowRevision) {
        try { await this.auth.clearLocalSession?.() } catch { /* The workspace remains invalidated even if browser storage is unavailable. */ }
        this.update({ phase: "signed_out", error: "Signed out of this workspace. Session cleanup could not be confirmed; close this browser session before leaving a shared device." })
      }
    }
  }

  cancel = () => { this.acceptAuthEvents = false; this.flowRevision += 1; this.invalidate() }

  private guardedResponse(response: Response, epoch: number, ownerId: string, release: () => void): Response {
    const check = () => this.assertCurrent(epoch, ownerId)
    let guardedBody: ReadableStream | null = null
    return new Proxy(response, {
      get: (target, property) => {
        if (property === "clone") return () => { check(); return this.guardedResponse(target.clone(), epoch, ownerId, release) }
        if (["json", "text", "arrayBuffer", "blob", "formData", "bytes"].includes(String(property))) return async (...args: unknown[]) => {
          try {
            check()
            const result = await (target[property as keyof Response] as (...args: unknown[]) => Promise<unknown>).apply(target, args)
            check()
            return result
          } finally { release() }
        }
        if (property === "body" && target.body) {
          if (guardedBody) return guardedBody
          const reader = target.body.getReader()
          guardedBody = new ReadableStream({
            pull: async stream => {
              try { check(); const chunk = await reader.read(); check(); if (chunk.done) { release(); stream.close() } else stream.enqueue(chunk.value) }
              catch (error) { void reader.cancel(); release(); stream.error(error) }
            },
            cancel: reason => { release(); return reader.cancel(reason) },
          })
          return guardedBody
        }
        const value = Reflect.get(target, property, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
  }

  ownerFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const owner = this.state.owner
    if (!owner) throw new Error("Sign in to continue.")
    const epoch = this.state.epoch
    const url = new URL(input instanceof Request ? input.url : String(input), this.origin)
    if (url.origin !== new URL(this.origin).origin) throw new Error("Owner requests must stay on this app.")
    const session = await this.auth.getSession()
    this.assertCurrent(epoch, owner.id)
    if (session.error || !session.data.session?.access_token) { this.invalidate({ error: "Your session expired. Sign in again." }); throw new Error("Sign in to continue.") }
    await this.verifySession(session.data.session)
    this.assertCurrent(epoch, owner.id)
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    if (init.signal?.aborted) controller.abort()
    else init.signal?.addEventListener("abort", onAbort, { once: true })
    this.activeRequests.add(controller)
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    headers.set("Authorization", `Bearer ${this.verifiedToken}`)
    let returned = false
    const release = () => { this.activeRequests.delete(controller); init.signal?.removeEventListener("abort", onAbort) }
    try {
      const response = await this.fetcher(input, { ...init, headers, signal: controller.signal, cache: "no-store", credentials: "same-origin", redirect: "error" })
      this.assertCurrent(epoch, owner.id)
      if (response.status === 401) { this.invalidate({ error: "Your session expired. Sign in again." }); throw new Error("Sign in to continue.") }
      returned = true
      return this.guardedResponse(response, epoch, owner.id, release)
    } finally {
      if (!returned) release()
    }
  }
}

let browserController: OwnerSessionController | null = null
const AUTH_STORAGE_KEY = "jobestimatepro-auth"
function getBrowserController() {
  if (browserController) return browserController
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Account sign-in is not configured. Contact the app administrator.")
  const client = createClient(url, key, { auth: { storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, flowType: "pkce", detectSessionInUrl: false } })
  const auth: OwnerAuthPort = {
    getSession: () => client.auth.getSession(),
    async signInWithOtp(credentials) { await client.auth.startAutoRefresh(); return client.auth.signInWithOtp(credentials) },
    verifyOtp: credentials => client.auth.verifyOtp(credentials),
    signOut: options => client.auth.signOut(options),
    onAuthStateChange: callback => client.auth.onAuthStateChange(callback),
    async clearLocalSession() {
      await client.auth.stopAutoRefresh()
      for (const storageKey of [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`, `${AUTH_STORAGE_KEY}-user`]) window.localStorage.removeItem(storageKey)
    },
  }
  browserController = new OwnerSessionController(auth, (input, init) => window.fetch(input, init), window.location.origin)
  return browserController
}

export function useOwnerSession() {
  const [state, setState] = useState<OwnerSessionState>(INITIAL_STATE)
  const controller = useRef<OwnerSessionController | null>(null)
  useEffect(() => {
    try {
      const session = getBrowserController()
      controller.current = session
      const unsubscribe = session.subscribe(setState)
      setState(session.getState())
      void session.start()
      return unsubscribe
    } catch (error) {
      setState({ ...INITIAL_STATE, phase: "signed_out", error: error instanceof Error ? error.message : "Sign-in is unavailable." })
    }
  }, [])
  const signIn = useCallback(async (email: string) => { await controller.current?.signIn(email) }, [])
  const verify = useCallback(async (code: string) => { await controller.current?.verify(code) }, [])
  const signOut = useCallback(async () => { await controller.current?.signOut() }, [])
  const cancel = useCallback(() => controller.current?.cancel(), [])
  const ownerFetch = useCallback((input: RequestInfo | URL, init?: RequestInit) => {
    if (!controller.current) return Promise.reject(new Error("Sign in to continue."))
    return controller.current.ownerFetch(input, init)
  }, [])
  const isCurrentOwner = useCallback((ownerId: string, epoch?: number) => controller.current?.isCurrentOwner(ownerId, epoch) === true, [])
  return { ...state, signIn, verify, signOut, cancel, ownerFetch, isCurrentOwner }
}

export type OwnerSessionHandle = ReturnType<typeof useOwnerSession>

/** Bind callbacks to the workspace that created their payload, including a same-owner sign-out/sign-in boundary. */
export function createOwnerBoundFetch(session: Pick<OwnerSessionHandle, "ownerFetch" | "isCurrentOwner">, ownerId: string, epoch: number): typeof fetch {
  return (input, init) => {
    if (!session.isCurrentOwner(ownerId, epoch)) return Promise.reject(new StaleOwnerSessionError())
    return session.ownerFetch(input, init)
  }
}
