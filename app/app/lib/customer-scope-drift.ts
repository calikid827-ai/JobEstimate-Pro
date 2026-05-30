import type { EstimateStructuredSection, ScopeXRay, UiTrade } from "./types"
import {
  buildEstimatorScopeFacts,
  type EstimatorScopeFacts,
  type EstimatorScopeTrade,
} from "./estimator-scope-facts"

type PlanTradeReadback = {
  trade?: string
  supportLevel?: "direct" | "reinforced" | "review" | string
}

type PlanIntelligenceLike = {
  detectedTrades?: string[]
  planReadback?: {
    tradeScopeReadback?: PlanTradeReadback[]
  } | null
} | null

type DriftTrade =
  | "electrical"
  | "plumbing"
  | "drywall"
  | "flooring"
  | "painting"
  | "bathroom_tile"
  | "demolition"
  | "carpentry"
  | "wallcovering"

type TradeRule = {
  id: DriftTrade
  label: string
  aliases: string[]
  mentionPattern: RegExp
  supportPattern: RegExp
}

export type CustomerScopeReviewWarning = {
  label: string
  message: string
  details?: string[]
}

export type CustomerScopeReviewGuard = {
  summary: string | null
  warnings: CustomerScopeReviewWarning[]
}

export type BuildCustomerScopeTradeDriftWarningArgs = {
  selectedTrade: UiTrade
  writtenScope: string
  resultText: string
  estimateSections: EstimateStructuredSection[] | null
  scopeXRay: ScopeXRay
  planIntelligence: PlanIntelligenceLike
}

const TRADE_RULES: TradeRule[] = [
  {
    id: "electrical",
    label: "electrical",
    aliases: ["electrical", "electrician"],
    mentionPattern:
      /\b(electrical|electrician|wiring|wires?|rewire|conduits?|outlets?|receptacles?|devices?|switches?|circuits?|breakers?|electrical\s+panels?|panel\s+work|lighting|light\s+fixtures?|can\s+lights?|recessed\s+lights?|recessed\s+lighting|electrical\s+rough[- ]?in|rough[- ]?in\s+electrical|electrical\s+coordination|electrical\s+trade)\b/i,
    supportPattern:
      /\b(electrical|electrician|wiring|wires?|rewire|conduits?|outlets?|receptacles?|devices?|switches?|circuits?|breakers?|electrical\s+panels?|panel\s+work|lighting|light\s+fixtures?|can\s+lights?|recessed\s+lights?|recessed\s+lighting|electrical\s+rough[- ]?in|rough[- ]?in\s+electrical)\b/i,
  },
  {
    id: "plumbing",
    label: "plumbing",
    aliases: ["plumbing", "plumber"],
    mentionPattern:
      /\b(plumbing|plumber|water\s+lines?|supply\s+lines?|drains?|drainage|valves?|toilets?|faucets?|sinks?|vanit(?:y|ies)|shower\s+valves?|tubs?|plumbing\s+rough[- ]?in|rough[- ]?in\s+plumbing)\b/i,
    supportPattern:
      /\b(plumbing|plumber|water\s+lines?|supply\s+lines?|drains?|drainage|valves?|toilets?|faucets?|sinks?|vanit(?:y|ies)|shower\s+valves?|tubs?|plumbing\s+rough[- ]?in|rough[- ]?in\s+plumbing)\b/i,
  },
  {
    id: "drywall",
    label: "drywall",
    aliases: ["drywall", "sheetrock", "gypsum"],
    mentionPattern:
      /\b(drywall|sheetrock|gypsum|skim\s+coat|finish\s+level|level\s+[345]|texture\s+match|orange\s+peel|knockdown)\b/i,
    supportPattern:
      /\b(drywall|sheetrock|gypsum|skim\s+coat|finish\s+level|level\s+[345]|texture\s+match|orange\s+peel|knockdown|\b\d+\s?(patches?|sheets?)\b)\b/i,
  },
  {
    id: "flooring",
    label: "flooring",
    aliases: ["flooring", "floor", "lvp", "laminate", "hardwood", "carpet"],
    mentionPattern:
      /\b(flooring|lvp|luxury\s+vinyl|laminate|hardwood|engineered\s+wood|carpet|underlayment|floor\s+installation|floor\s+install|transitions?)\b/i,
    supportPattern:
      /\b(flooring|lvp|luxury\s+vinyl|laminate|hardwood|engineered\s+wood|carpet|underlayment|floor\s+installation|floor\s+install|transitions?|\b\d+(\.\d+)?\s?(sq\.?\s?ft|sf|square\s+feet)\b)\b/i,
  },
  {
    id: "painting",
    label: "painting",
    aliases: ["painting", "paint", "painter"],
    mentionPattern:
      /\b(painting|paint|painter|primer|prime|coats?|painted\s+(walls?|ceilings?|trim|doors?|cabinets?))\b/i,
    supportPattern:
      /\b(painting|paint|painter|primer|prime|coats?|painted\s+(walls?|ceilings?|trim|doors?|cabinets?))\b/i,
  },
  {
    id: "bathroom_tile",
    label: "bathroom/tile",
    aliases: ["bathroom_tile", "tile", "tiling"],
    mentionPattern:
      /\b(tile|tiling|grout|waterproofing|waterproof|backer\s*board|cement\s*board|shower\s+pan|mud\s+bed|tile\s+(shower|floor|walls?)|shower\s+tile|bathroom\s+tile)\b/i,
    supportPattern:
      /\b(tile|tiling|grout|waterproofing|waterproof|backer\s*board|cement\s*board|shower\s+pan|mud\s+bed|tile\s+(shower|floor|walls?)|shower\s+tile|bathroom\s+tile)\b/i,
  },
  {
    id: "demolition",
    label: "demolition",
    aliases: ["demolition", "demo"],
    mentionPattern: /\b(demolition|demo|tear[- ]?out|remove\s+existing|haul[- ]?off|haul\s+away)\b/i,
    supportPattern: /\b(demolition|demo|tear[- ]?out|remove\s+existing|haul[- ]?off|haul\s+away)\b/i,
  },
  {
    id: "carpentry",
    label: "carpentry",
    aliases: ["carpentry", "carpenter", "framing", "trim", "baseboard", "baseboards"],
    mentionPattern:
      /\b(carpentry|carpenter|framing|blocking|baseboards?|casing|crown|trim\s+install|door\s+(install|replacement)|shelving|millwork)\b/i,
    supportPattern:
      /\b(carpentry|carpenter|framing|blocking|baseboards?|casing|crown|trim\s+install|door\s+(install|replacement)|shelving|millwork|\b\d+(\.\d+)?\s?(lf|linear\s+feet|linear\s+foot)\b)\b/i,
  },
  {
    id: "wallcovering",
    label: "wallcovering",
    aliases: ["wallcovering", "wallpaper", "wall covering"],
    mentionPattern:
      /\b(wallcovering|wall\s+covering|wallpaper|vinyl\s+wallcovering|grasscloth|wallcovering\s+adhesive|pattern\s+repeat|wallcovering\s+seams?)\b/i,
    supportPattern:
      /\b(wallcovering|wall\s+covering|wallpaper|vinyl\s+wallcovering|grasscloth|wallcovering\s+adhesive|pattern\s+repeat|wallcovering\s+seams?)\b/i,
  },
]

const EXCLUDED_TRADE_PATTERN =
  /\b(excludes?|excluded|excluding|does\s+not\s+cover|does\s+not\s+include|not\s+included|not\s+part\s+of|no\s+(?:work|scope|repair|repairs|replacement|installation|install|paint|painting|electrical|plumbing|flooring|drywall|carpentry|trim|baseboards?|demo|demolition)|without\s+(?:repair|repairs|replacement|installation|install|paint|painting|electrical|plumbing|flooring|drywall|carpentry|trim|baseboards?|demo|demolition)|by\s+others|by\s+owner|owner\s+provided|owner\s+supplied|separate\s+contractor|separate\s+trade|NIC)\b/i

const SUPPORTED_REMOVAL_TRADE_PATTERN =
  /\b(flooring|lvp|laminate|hardwood|carpet|tile|tiling|paint|painting|drywall|sheetrock|baseboards?|trim|carpentry|wallcovering|wallpaper)\b/i

const ELECTRICAL_SYSTEM_PATTERN =
  /\b(electrical\s+rough[- ]?in|rough[- ]?in\s+electrical|wiring|rewire|circuits?|breakers?|electrical\s+panels?|outlets?|receptacles?|switches?)\b/i

const PLUMBING_SYSTEM_PATTERN =
  /\b(plumbing\s+rough[- ]?in|rough[- ]?in\s+plumbing|water\s+lines?|supply\s+lines?|drains?|drainage|waste\s+lines?|valves?)\b/i

const WALL_FLOOR_REPAIR_PATTERN =
  /\b(wall\s+repairs?|floor\s+repairs?|flooring\s+repairs?|drywall\s+repairs?|sheetrock\s+repairs?|carpentry\s+repairs?)\b/i

const PAINTING_ADJACENT_DRYWALL_PATTERN =
  /\b(drywall\s+repairs?|sheetrock\s+repairs?|skim\s+coat|finish\s+level|level\s+[345]|texture\s+match|orange\s+peel|knockdown)\b/i

const MINOR_PAINT_PATCH_PATTERN =
  /\b(minor|nail[- ]?hole|small)\b.{0,40}\b(patch(?:ing|es)?|repair(?:s)?)\b|\b(patch(?:ing|es)?|repair(?:s)?)\b.{0,40}\b(minor|nail[- ]?hole|small)\b/i

const FLOORING_ADJACENT_PATTERN =
  /\b(baseboard\s+(replacement|replace|install|installation|repair)|baseboards?\s+(replacement|replace|install|installation|repair)|painting\s+(walls?|trim|baseboards?)|paint\s+(walls?|trim|baseboards?)|carpentry\s+work|trim\s+install|casing|crown)\b/i

const NON_SCOPE_CONTEXT_PATTERN =
  /\b(protect(?:s|ed|ing|ion)?|safeguard(?:ing)?|cover(?:s|ed|ing)?|mask(?:s|ed|ing)?|drop\s+cloths?|adjacent\s+finishes?|avoid(?:ing)?\s+interference|prevent(?:ing)?\s+interference|no\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination|independently|other\s+trades?|proceed\s+independently|allow\s+other\s+trades|work(?:ing)?\s+around|around\s+existing|existing\s+(?:flooring|floors?|baseboards?|trim|cabinetry|cabinets?|door\s+jambs?|closets?|transitions?|electrical\s+(?:wiring|components?)))\b/i

const FLOORING_CONTEXT_ONLY_PATTERN =
  /\b(protect(?:s|ed|ing|ion)?|safeguard(?:ing)?|cover(?:s|ed|ing)?|mask(?:s|ed|ing)?|drop\s+cloths?|floor\s+protection|work(?:ing)?\s+around|around\s+existing|coordinate|coordination|no\s+interference|avoid(?:ing)?\s+interference)\b.{0,100}\b(flooring|floors?|lvp|laminate|hardwood|carpet|transitions?)\b|\b(flooring|floors?|lvp|laminate|hardwood|carpet|transitions?)\b.{0,100}\b(protect(?:s|ed|ing|ion)?|safeguard(?:ing)?|cover(?:s|ed|ing)?|mask(?:s|ed|ing)?|drop\s+cloths?|floor\s+protection|prevent(?:ing)?\s+(?:paint\s+)?(?:overspray|drips?)|paint\s+drips?|work(?:ing)?\s+around|around\s+existing|coordinate|coordination|no\s+interference|avoid(?:ing)?\s+interference)\b/i

const FLOORING_TRUE_WORK_PATTERN =
  /\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|remove|removal|level(?:ing)?)\s+(?:\w+\s+){0,3}(flooring|floors?|lvp|luxury\s+vinyl|laminate|hardwood|carpet)\b|\b(flooring|floors?|lvp|luxury\s+vinyl|laminate|hardwood|carpet)\s+(?:\w+\s+){0,3}(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|remove|removal|level(?:ing)?)\b|\bflooring\s+demo(?:lition)?\b|\bdemo(?:lition)?\s+of\s+flooring\b|\bunderlayment\b/i

const ELECTRICAL_CONTEXT_ONLY_PATTERN =
  /\b(no\s+interference|avoid(?:ing)?\s+interference|prevent(?:ing)?\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination|protect(?:ing|ion)?|safeguard(?:ing)?|independently|proceed\s+independently|by\s+others|other\s+trades?|allow\s+other\s+trades)\b.{0,120}\b(electrical|electrician|wiring|components?|outlets?|switches?|lighting|fixtures?|trades?)\b|\b(electrical|electrician|wiring|components?|outlets?|switches?|lighting|fixtures?|trades?)\b.{0,120}\b(no\s+interference|avoid(?:ing)?\s+interference|prevent(?:ing)?\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination|protect(?:ing|ion)?|safeguard(?:ing)?|independently|proceed\s+independently|by\s+others|other\s+trades?|allow\s+other\s+trades)\b|\b(existing|adjacent)\s+electrical\s+(wiring|components?)\b/i

const ELECTRICAL_MASKING_CONTEXT_ONLY_PATTERN =
  /\b(mask(?:ed|ing)?(?:\s+tape)?(?:\s+(?:applied|installed))?|protect(?:s|ed|ing|ion)?|cover(?:s|ed|ing)?|tape|remov(?:e|ed|al)?(?:\s*\/\s*|\s+and\s+)?reinstall(?:ed|ation|ing)?|to\s+remain|remain)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?|outlets?|switches?|electrical\s+fixtures?|light\s+fixtures?)\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?|outlets?|switches?|electrical\s+fixtures?|light\s+fixtures?)\b.{0,100}\b(mask(?:ed|ing)?|protect(?:ed|ing|ion)?|cover(?:ed|ing)?|tape|remov(?:e|ed|al)?(?:\s*\/\s*|\s+and\s+)?reinstall(?:ed|ation|ing)?|to\s+remain|remain)\b/i

const ELECTRICAL_COVER_PLATE_PAINTING_CONTEXT_PATTERN =
  /\b(remov(?:e|ed|al)?|removal)\b.{0,40}\b(reinstall(?:ed|ation|ing)?|reinstallation)\b.{0,80}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,120}\b(paint|painting|painted)\b|\b(remov(?:e|ed|al)?|removal)\b\s*\/\s*\b(reinstall(?:ed|ation|ing)?|reinstallation)\b.{0,80}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,120}\b(paint|painting|painted)\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,80}\b(remov(?:e|ed|al)?|removal|reinstall(?:ed|ation|ing)?|reinstallation)\b.{0,80}\b(reinstall(?:ed|ation|ing)?|reinstallation|remov(?:e|ed|al)?|removal)\b.{0,120}\b(paint|painting|painted)\b/i

const ELECTRICAL_COVER_PLATE_GENERATED_CONTEXT_PATTERN =
  /\belectrical\s+(?:devices?|components?)\b.{0,80}\b(mask(?:ed|ing)?|protect(?:ed|ing|ion)?)\b|\b(mask(?:ed|ing)?|protect(?:ed|ing|ion)?)\b.{0,80}\belectrical\s+(?:devices?|components?)\b|\belectrical\s+outlet\s+covers?\b|\bcoordination\s+with\s+(?:the\s+)?electrical\s+trade\b.{0,120}\b(confined|limited|required\s+to\s+manage|manage)\b.{0,140}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b|\belectrical\s+trade\s+coordination\b.{0,120}\bmanage\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b|\belectrical\s+coordination\b.{0,100}\b(confined|limited)\b.{0,120}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b|\bmanage\s+(?:the\s+)?(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\bwithout\s+causing\s+damage\s+to\s+(?:wiring|devices?)\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,80}\bremov(?:e|ed|al)?(?:\s*\/\s*|\s+and\s+)?reinstall(?:ed|ation|ing)?\b.{0,140}\bwithout\s+(?:disturbing|electrical\s+work|rewiring|device\s+replacement)\b|\bremov(?:e|ed|al)?(?:\s*\/\s*|\s+and\s+)?reinstall(?:ed|ation|ing)?\b.{0,80}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\bwithout\s+(?:disturbing|electrical\s+work|rewiring|device\s+replacement)\b|\bwithout\s+causing\s+damage\s+to\s+(?:wiring|devices?)\b|\bno\s+damage\s+to\s+(?:wiring|devices?)\b|\b(?:wiring|devices?)\b.{0,80}\b(?:to\s+remain\s+untouched|remain\s+(?:existing|to\s+remain))\b|\bno\s+(?:electrical\s+)?rewiring\b|\bno\s+(?:electrical\s+)?(?:device\s+)?replacement\b|\bno\s+electrical\s+work\s+beyond\b.{0,120}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b/i

const ELECTRICAL_COVER_PLATE_REPLACEMENT_CONTEXT_PATTERN =
  /\bremoval\s+(?:and|\/)\s+replacement\s+of\s+(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\b(paint|painting|only|without\s+causing\s+damage|wiring|devices?)\b|\bremov(?:e|ed|al)?(?:\s*\/\s*|\s+and\s+)?replace(?:d|ment|ing)?\b.{0,80}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\b(paint|painting|only|without\s+causing\s+damage|wiring|devices?)\b|\bcoordination\s+with\s+(?:the\s+)?electrical\s+trade\b.{0,220}\bfacilitat(?:e|es|ed|ing|ion)\b.{0,180}\b(removal|remove)\b.{0,80}\b(replacement|replace|reinstall(?:ation|ed|ing)?)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b|\belectrical\s+trade\s+coordination\b.{0,160}\bfacilitat(?:e|es|ed|ing|ion)\b.{0,140}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,120}\b(removal|remove|replacement|replace|reinstall(?:ation|ed|ing)?)\b|\b(outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+removal\s*\/\s*(?:replacement|reinstallation)\b.{0,140}\bwithout\s+causing\s+damage\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,120}\b(remov(?:e|ed|al)?|reinstall(?:ed|ation|ing)?|replace(?:d|ment|ing)?)\b.{0,140}\bwithout\s+(?:causing\s+damage|interfering\s+with|disrupting)\s+(?:existing\s+)?wiring\b|\bremov(?:e|ed|al)?(?:\s*\/\s*|\s+and\s+)?reinstall(?:ed|ation|ing)?\b.{0,80}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\bwithout\s+(?:causing\s+damage|interfering\s+with|disrupting)\s+(?:existing\s+)?wiring\b|\bremov(?:e|ed|al)?(?:\s*\/\s*|\s+and\s+)?reinstall(?:ed|ation|ing)?\b.{0,80}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\bwithout\s+causing\s+damage\s+or\s+(?:interfering\s+with|disrupting)\s+(?:existing\s+)?wiring\b|\bno\s+electrical\s+work\s+beyond\b.{0,120}\b(outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+removal\s*\/\s*(?:replacement|reinstallation)\b/i

const ELECTRICAL_COVER_PLATE_COORDINATION_CONTEXT_PATTERN =
  /\belectrical\s+devices?\b.{0,80}\b(?:to\s+prevent|prevent(?:ing)?|prevent)\b.{0,80}\b(?:paint\s+)?overspray\s+or\s+damage\b|\belectrical\s+devices?\b.{0,80}\b(?:mask(?:ed|ing)?|protect(?:ed|ing)?)\b.{0,100}\b(?:prevent(?:ing)?|to\s+prevent)\b.{0,80}\b(?:paint\s+)?overspray\b|\bcoordination\s+with\s+(?:the\s+)?electrical\s+trade\s+is\s+necessary\b.{0,180}\bfacilitat(?:e|es|ed|ing|ion)\b.{0,160}\b(?:removal|remove)\b.{0,80}\b(?:reinstallation|reinstall(?:ed|ing)?)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,180}\bwithout\s+causing\s+damage\s+or\s+(?:interfering\s+with|disrupting)\s+(?:existing\s+)?wiring\b|\bcoordination\s+with\s+(?:the\s+)?electrical\s+trade\b.{0,160}\bnecessary\b.{0,160}\bfacilitat(?:e|es|ed|ing|ion)\b.{0,140}\b(outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+(?:removal\s*\/\s*reinstallation|handling)\b|\belectrical\s+trade\s+coordination\b.{0,120}\bnecessary\b.{0,160}\bfacilitat(?:e|es|ed|ing|ion)\b.{0,120}\b(outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+handling\b|\b(?:coordination\s+with\s+(?:the\s+)?electrical\s+trade|electrical\s+trade\s+coordination)\b.{0,180}\bhandl(?:e|ed|ing)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,180}\b(?:prevent|avoid|without)\b.{0,80}\binterfer(?:ence|ing)?\b.{0,80}\b(?:existing\s+)?wiring\b|\bhandl(?:e|ed|ing)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,180}\b(?:prevent|avoid|without)\b.{0,80}\binterfer(?:ence|ing)?\b.{0,80}\b(?:existing\s+)?wiring\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,80}\bhandled\b.{0,140}\b(?:prevent|avoid|without)\b.{0,80}\binterfer(?:ence|ing)?\b.{0,80}\b(?:existing\s+)?wiring\b|\bprevent\s+interference\s+with\s+(?:existing\s+)?wiring\b.{0,120}\bduring\s+(?:outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+(?:removal\s*\/\s*reinstallation|handling|remov(?:al|e)|reinstall(?:ation|ing)?)\b|\bremoval\s+and\s+reinstallation\s+of\s+(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,160}\bwithout\s+causing\s+damage\s+or\s+(?:interfering\s+with|disrupting)\s+(?:existing\s+)?wiring\b|\b(outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+handling\b.{0,120}\bwithout\s+causing\s+damage\s+or\s+(?:interfering\s+with|disrupting)\s+(?:existing\s+)?wiring\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,80}\bhandled\b.{0,120}\bwithout\s+(?:damaging|disrupting|damaging\s+or\s+disrupting)\s+(?:existing\s+)?wiring\b/i

const ELECTRICAL_COVER_PLATE_UNAFFECTED_CONTEXT_PATTERN =
  /\bcoordination\s+with\s+(?:the\s+)?electrical\s+trade\s+is\s+necessary\b.{0,180}\bsafely\s+remov(?:e|ed|ing)?\b.{0,80}\breinstall(?:ed|ing)?\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\bwithout\s+(?:affecting|disrupting)\s+(?:wiring|devices?|circuits?)\b|\bcoordination\s+with\s+(?:the\s+)?electrical\s+trade\b.{0,160}\bnecessary\b.{0,120}\bsafely\s+remov(?:e|ed|ing)?\s*\/\s*reinstall(?:ed|ing)?\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\bwithout\s+(?:affecting|disrupting)\s+(?:wiring|devices?|circuits?)\b|\belectrical\s+trade\s+coordination\b.{0,120}\bnecessary\b.{0,160}\bsafely\s+remov(?:e|ed|ing)?\b.{0,80}\breinstall(?:ed|ing)?\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\bwithout\s+(?:affecting|disrupting)\s+(?:wiring|devices?|circuits?)\b|\bsafely\s+remov(?:e|ed|ing)?\b.{0,80}\breinstall(?:ed|ing)?\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,140}\bwithout\s+(?:affecting|disrupting)\s+(?:wiring|devices?|circuits?)\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,80}\bsafely\s+remov(?:e|ed|ing)?\b.{0,80}\breinstall(?:ed|ing)?\b.{0,140}\bwithout\s+(?:affecting|disrupting)\s+(?:wiring|devices?|circuits?)\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,80}\bremov(?:e|ed|al)?(?:\s*\/\s*|\s+and\s+)?reinstall(?:ed|ation|ing)?\b.{0,140}\bwithout\s+(?:affecting|disrupting)\s+(?:wiring|devices?|circuits?)\b|\b(outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+removal\s*\/\s*reinstallation\b.{0,140}\bwithout\s+(?:affecting|disrupting)\s+(?:wiring|devices?|circuits?)\b|\b(wiring|devices?|circuits?)\b.{0,80}\b(?:are\s+not\s+affected|remain\s+unaffected)\b|\bwiring\s*\/\s*devices?\s+remain\s+unaffected\b/i

const ELECTRICAL_COVER_PLATE_LIMITED_HANDLING_CONTEXT_PATTERN =
  /\bcoordination\s+with\s+(?:the\s+)?electrical\s+trade\b.{0,120}\b(?:is\s+)?(?:limited\s+to|for|required\s+for)\b.{0,100}\b(outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+handling\s+only\b|\belectrical\s+trade\s+coordination\b.{0,120}\b(?:is\s+)?limited\s+to\b.{0,120}\b(?:remov(?:ing|e|al)?|removal)\b.{0,80}\b(?:reinstall(?:ing|ation|ed)?|reinstallation)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,100}\bpainting\s+only\b|\belectrical\s+coordination\s+only\b.{0,120}\b(?:remov(?:ing|e|al)?|removal)\b.{0,80}\b(?:reinstall(?:ing|ation|ed)?|reinstallation)\b.{0,100}\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,100}\bpainting\b|\b(outlet\s+cover|switch\s+cover|cover\s+plate)s?\s+handling\s+only\b.{0,120}\bno\s+(?:electrical\s+work|wiring|device|circuit)\b|\b(outlet\s+covers?|switch\s+covers?|cover\s+plates?)\b.{0,80}\bhandled\s+only\b.{0,120}\bno\s+(?:electrical\s+work|wiring|device|circuit)\b/i

const ELECTRICAL_TRUE_WORK_PATTERN =
  /\b(electrical\s+rough[- ]?in|rough[- ]?in\s+electrical|add\s+circuits?|run(?:ning)?\s+(?:new\s+)?wires?|panel\s+work|breaker\s+work|wiring\s+adjustments?|electrical\s+wiring\s+adjustments?|(?:electrical\s+)?wiring\s+to\s+(?:accommodate|align)|panel\s+(upgrade|replacement|replace|install(?:ation|ing)?|repair)|breaker\s+(replacement|replace|install(?:ation|ing)?|repair))\b|\b(disconnect(?:ing|ion)?|install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|remove|removal|reinstall(?:ation|ing)?|run(?:ning)?|add(?:ing)?|mov(?:e|ed|ing)?|relocate|rewire|wire|adjust(?:ment|ing|s)?)\s+(?:new\s+)?(?:electrical\s+)?(wiring|wires?|conduits?|devices?|outlets?|receptacles?|switches?|light\s+fixtures?|lighting|circuits?|breakers?|panels?)\b|\b(disconnection|disconnecting|removal|replacement|reinstallation|reinstall|repair)\s+(?:and\s+(?:reinstallation|reinstalling|replacement|reinstall|repair)\s+)?of\s+(?:electrical\s+)?(wiring|wires?|conduits?|devices?|outlets?|receptacles?|switches?|light\s+fixtures?|lighting|circuits?|breakers?|panels?)\b|\b(relocation|adjustments?|verification)\s+of\s+(?:existing\s+)?(?:electrical\s+)?(wiring|wires?|conduits?|devices?|outlets?|receptacles?|switches?|light\s+fixtures?|lighting|circuits?|breakers?|panels?)\b|\belectrical\s+(?:scope|tasks?|work)\s+includes\b.{0,120}\b(wiring|wires?|conduits?|devices?|outlets?|receptacles?|switches?|fixtures?|light\s+fixtures?|lighting|circuits?|breakers?|panels?)\b|\belectrical\b.{0,120}\b(relocation|adjustments?|patching)\s+of\s+(?:existing\s+)?(?:fixtures?|conduit\s+penetrations?|penetrations?)\b|\b(relocation|adjustments?|patching)\s+of\s+(?:existing\s+)?(?:fixtures?|conduit\s+penetrations?|penetrations?)\b.{0,120}\belectrical\b|\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|remove|removal|reinstall(?:ation|ing)?|add(?:ing)?)\s+(?:new\s+)?electrical\s+fixtures?\b|\b(?:electrical\s+)?(wiring|wires?|conduits?|devices?|outlets?|receptacles?|switches?|light\s+fixtures?|lighting|circuits?|breakers?|panels?)\s+(disconnect(?:ing|ion)?|install(?:ation|ing)?|replacement|replace|repair(?:ing|s)?|remove|removal|reinstall(?:ation|ing)?|adjustments?|rough[- ]?in)\b|\belectrical\s+fixtures?\s+(install(?:ation|ing)?|replacement|replace|repair(?:ing|s)?|remove|removal|reinstall(?:ation|ing)?)\b/i

const SUBSEQUENT_TRADE_CONTEXT_PATTERN =
  /\b(after|before|following|once|upon completion of|prior to|subsequent|by others|others to|separate trade|separate trades|separate contractor|coordinate|coordinating|coordination|sequencing|sequence|existing)\b/i

const DRYWALL_CONTEXT_ONLY_PATTERN =
  /\b(drywall|sheetrock|gypsum|skim\s+coat|finish\s+level|level\s+[345]|texture\s+match|orange\s+peel|knockdown)\b/i

const DRYWALL_SUBSTRATE_CONTEXT_ONLY_PATTERN =
  /\b(?:standard|existing|paintable|previously\s+painted)?\s*(?:drywall|sheetrock|gypsum)\s+(?:surfaces?|walls?|wall\s+surfaces?|substrates?)\b.{0,120}\b(?:paint|painting|painted|receive\s+paint|coats?|wall\s+painting)\b|\b(?:paint|painting|painted|coats?|wall\s+painting)\b.{0,120}\b(?:over\s+)?(?:standard|existing|paintable|previously\s+painted)?\s*(?:drywall|sheetrock|gypsum)\s+(?:surfaces?|walls?|wall\s+surfaces?|substrates?)\b|\bassum(?:e|es|ed|ing)\b.{0,80}\bstandard\s+(?:drywall|sheetrock|gypsum)\s+surfaces?\b|\b(?:drywall|sheetrock|gypsum)\b.{0,80}\b(?:and|\/)\s*paint(?:ing)?\b|\bpaint(?:ing)?\b.{0,80}\b(?:and|\/)\s*(?:drywall|sheetrock|gypsum)\b/i

const DRYWALL_TRUE_WORK_PATTERN =
  /\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|patch(?:ing|es)?|hang(?:ing)?|finish(?:ing)?|texture|demo(?:lition)?)\b.{0,80}\b(drywall|sheetrock|gypsum)\b|\b(drywall|sheetrock|gypsum)\b.{0,80}\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|patch(?:ing|es)?|hang(?:ing)?|finish(?:ing)?|texture|demo(?:lition)?)\b/i

const PAINTING_CONTEXT_ONLY_PATTERN =
  /\b(painting|paint|painter|primer|prime|coats?|painted\s+(walls?|ceilings?|trim|doors?|cabinets?))\b/i

const PLUMBING_CONTEXT_ONLY_PATTERN =
  /\b(no\s+interference|avoid(?:ing)?\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination|independently|proceed\s+independently|by\s+others|other\s+trades?|allow\s+other\s+trades)\b.{0,120}\b(plumbing|plumber|water\s+lines?|supply\s+lines?|drains?|valves?|fixtures?|trades?)\b|\b(plumbing|plumber|water\s+lines?|supply\s+lines?|drains?|valves?|fixtures?|trades?)\b.{0,120}\b(no\s+interference|avoid(?:ing)?\s+interference|without\s+interference|coordinate|coordinates|coordinating|coordination|independently|proceed\s+independently|by\s+others|other\s+trades?|allow\s+other\s+trades)\b/i

const PLUMBING_TRUE_WORK_PATTERN =
  /\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|rough[- ]?in|plumb(?:ing)?|connect(?:ion|ing)?|reconnect(?:ion|ing)?|valves?|drains?|supply\s+lines?|water\s+lines?)\b.{0,60}\b(plumbing|plumber|fixtures?|toilets?|faucets?|sinks?|vanit(?:y|ies)|showers?|tubs?)\b|\b(plumbing|plumber|fixtures?|toilets?|faucets?|sinks?|vanit(?:y|ies)|showers?|tubs?)\b.{0,60}\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|rough[- ]?in|plumb(?:ing)?|connect(?:ion|ing)?|reconnect(?:ion|ing)?|valves?|drains?|supply\s+lines?|water\s+lines?)\b/i

const CARPENTRY_CONTEXT_ONLY_PATTERN =
  /\b(work(?:ing)?\s+around|around\s+existing|coordinate|coordination|no\s+interference|avoid(?:ing)?\s+interference|minimi[sz]e\s+interference|protect(?:ing|ion)?|safeguard(?:ing)?)\b.{0,120}\b(carpentry|carpentry\s+work|carpentry\s+activities|carpentry\s+elements|door\s+jambs?|closets?|transitions?|baseboards?|baseboard\s+finishes?|trim|cabinetry|cabinets?)\b|\b(carpentry|carpentry\s+work|carpentry\s+activities|carpentry\s+elements|door\s+jambs?|closets?|transitions?|baseboards?|baseboard\s+finishes?|trim|cabinetry|cabinets?)\b.{0,120}\b(work(?:ing)?\s+around|around\s+existing|coordinate|coordination|no\s+interference|avoid(?:ing)?\s+interference|minimi[sz]e\s+interference|protect(?:ing|ion)?|safeguard(?:ing)?)\b/i

const CARPENTRY_TRUE_WORK_PATTERN =
  /\b(baseboards?|casing|crown|trim|doors?|shelving|millwork|cabinetry|cabinets?)\s+(replacement|replace|install(?:ation|ing)?|repair(?:ing|s)?)\b|\b(replace(?:ment|ing)?|install(?:ation|ing)?|repair(?:ing|s)?)\s+(?:\w+\s+){0,2}(baseboards?|casing|crown|trim|doors?|shelving|millwork|cabinetry|cabinets?)\b|\b(framing|blocking)\b/i

const DEMOLITION_LIMITING_CONTEXT_PATTERN =
  /\b(without|no|excluding|excluded|excludes?|not\s+including|does\s+not\s+include|does\s+not\s+cover)\b.{0,50}\b(demo|demolition|tear[- ]?out|removal)\b|\b(demo|demolition|tear[- ]?out|removal)\b.{0,50}\b(excluded|by\s+others|not\s+included|beyond\s+patch\s+repairs?)\b/i

const CARPENTRY_REPLACEMENT_REMOVAL_PATTERN =
  /\b(remov(?:e|al|ing)|dispos(?:e|al|ing))\b.{0,90}\b(existing\s+)?(baseboards?|trim|casing|crown|millwork)\b|\b(existing\s+)?(baseboards?|trim|casing|crown|millwork)\b.{0,90}\b(remov(?:e|al|ing)|dispos(?:e|al|ing))\b/i

const CARPENTRY_REPLACEMENT_DEMO_CONTEXT_PATTERN =
  /\bdemolition\s+of\s+(?:the\s+)?(?:existing\s+)?(baseboards?|trim|casing|crown|millwork)\b|\b(existing\s+)?(baseboards?|trim|casing|crown|millwork)\s+demolition\b/i

function normalize(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function sentenceParts(value: string) {
  return String(value || "")
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function tradeMatches(rule: TradeRule, value: string) {
  const text = normalize(value)
  return rule.aliases.some((alias) => text.includes(alias)) || rule.supportPattern.test(text)
}

function selectedTradeSupports(rule: TradeRule, selectedTrade: UiTrade) {
  if (rule.id === "demolition") return false
  if (rule.id === "bathroom_tile") return selectedTrade === "bathroom_tile"
  return rule.aliases.includes(normalize(selectedTrade))
}

function ruleScopeTrade(rule: TradeRule): EstimatorScopeTrade {
  return rule.id
}

function factsIncludeTrade(facts: EstimatorScopeFacts, rule: TradeRule) {
  const trade = ruleScopeTrade(rule)
  return (
    facts.includedTrades.includes(trade) ||
    facts.clauses.some((clause) => clause.includedWork && clause.trades.includes(trade))
  )
}

function factsExcludeTrade(facts: EstimatorScopeFacts, rule: TradeRule) {
  const trade = ruleScopeTrade(rule)
  return (
    facts.excludedTrades.includes(trade) ||
    facts.clauses.some((clause) => clause.excludedByOthers && clause.trades.includes(trade))
  )
}

function factsContextOnlyTrade(facts: EstimatorScopeFacts, rule: TradeRule) {
  const trade = ruleScopeTrade(rule)
  return (
    facts.coordinationTrades.includes(trade) ||
    facts.protectionTrades.includes(trade) ||
    facts.existingConditionTrades.includes(trade)
  )
}

function writtenScopeFacts(args: BuildCustomerScopeTradeDriftWarningArgs) {
  return buildEstimatorScopeFacts(args.writtenScope)
}

function planReadbackSupports(rule: TradeRule, planIntelligence: PlanIntelligenceLike) {
  return (
    planIntelligence?.planReadback?.tradeScopeReadback?.some(
      (item) =>
        tradeMatches(rule, item.trade || "") &&
        (item.supportLevel === "direct" || item.supportLevel === "reinforced")
    ) || false
  )
}

function pricedSectionsSupport(rule: TradeRule, estimateSections: EstimateStructuredSection[] | null) {
  if (rule.id === "demolition") return false
  return (estimateSections || []).some((section) => tradeMatches(rule, section.trade))
}

function writtenScopeSupports(rule: TradeRule, writtenScope: string) {
  const facts = buildEstimatorScopeFacts(writtenScope)
  if (!factsIncludeTrade(facts, rule)) return false

  return facts.clauses.some(
    (clause) =>
      clause.includedWork &&
      clause.trades.includes(ruleScopeTrade(rule)) &&
      rule.supportPattern.test(clause.text) &&
      !isNonScopeContextMention(clause.text, rule)
  )
}

function scopeXRaySupports(rule: TradeRule, scopeXRay: ScopeXRay) {
  return (scopeXRay?.detectedScope?.splitScopes || []).some(
    (item) =>
      sentenceParts(item.scope || "").some(
        (part) =>
          rule.supportPattern.test(part) &&
          !EXCLUDED_TRADE_PATTERN.test(part) &&
          !isNonScopeContextMention(part, rule) &&
          !(
            rule.id === "electrical" &&
            /^(electrical|electrical\s+trade|electrical\s+coordination|electrical\s+coordination\s+only)$/i.test(
              normalize(part)
            )
          )
      )
  )
}

function isNormalSupportedRemoval(part: string, rule: TradeRule, args: BuildCustomerScopeTradeDriftWarningArgs) {
  if (rule.id !== "demolition") return false
  if (
    CARPENTRY_REPLACEMENT_REMOVAL_PATTERN.test(part) ||
    CARPENTRY_REPLACEMENT_DEMO_CONTEXT_PATTERN.test(part)
  ) {
    const carpentryRule = TRADE_RULES.find((candidate) => candidate.id === "carpentry")
    if (carpentryRule && isTradeSupported(carpentryRule, args)) return true
  }
  if (/\bdemolition\b/i.test(part) && !DEMOLITION_LIMITING_CONTEXT_PATTERN.test(part)) return false
  if (!SUPPORTED_REMOVAL_TRADE_PATTERN.test(part)) return false

  return TRADE_RULES.some(
    (candidate) =>
      candidate.id !== "demolition" &&
      candidate.supportPattern.test(part) &&
      isTradeSupported(candidate, args)
  )
}

function hasSupportedCarpentryReplacementRemovalContext(
  resultText: string,
  args: BuildCustomerScopeTradeDriftWarningArgs
) {
  if (
    !CARPENTRY_REPLACEMENT_REMOVAL_PATTERN.test(resultText) &&
    !CARPENTRY_REPLACEMENT_DEMO_CONTEXT_PATTERN.test(resultText)
  ) {
    return false
  }
  const carpentryRule = TRADE_RULES.find((candidate) => candidate.id === "carpentry")
  return Boolean(carpentryRule && isTradeSupported(carpentryRule, args))
}

function isNonScopeContextMention(part: string, rule: TradeRule) {
  if (
    rule.id === "drywall" &&
    DRYWALL_SUBSTRATE_CONTEXT_ONLY_PATTERN.test(part) &&
    !DRYWALL_TRUE_WORK_PATTERN.test(part)
  ) {
    return true
  }
  if (
    rule.id === "drywall" &&
    SUBSEQUENT_TRADE_CONTEXT_PATTERN.test(part) &&
    DRYWALL_CONTEXT_ONLY_PATTERN.test(part) &&
    !PAINTING_ADJACENT_DRYWALL_PATTERN.test(part)
  ) {
    return true
  }
  if (
    rule.id === "painting" &&
    SUBSEQUENT_TRADE_CONTEXT_PATTERN.test(part) &&
    PAINTING_CONTEXT_ONLY_PATTERN.test(part) &&
    !/\b(paint(?:ing)?|prime|primer)\s+(walls?|ceilings?|trim|doors?|cabinets?|baseboards?)\b/i.test(part)
  ) {
    return true
  }
  if (
    rule.id === "flooring" &&
    SUBSEQUENT_TRADE_CONTEXT_PATTERN.test(part) &&
    rule.mentionPattern.test(part) &&
    !FLOORING_TRUE_WORK_PATTERN.test(part)
  ) {
    return true
  }
  if (
    rule.id === "carpentry" &&
    SUBSEQUENT_TRADE_CONTEXT_PATTERN.test(part) &&
    rule.mentionPattern.test(part) &&
    !CARPENTRY_TRUE_WORK_PATTERN.test(part)
  ) {
    return true
  }
  if (
    rule.id === "carpentry" &&
    /\b(follow|follows|following|precede|precedes|preceding|before|after|sequence|sequencing|coordinat(?:e|ed|ion))\b/i.test(part) &&
    /\b(framing|finish trades?|carpentry|trim|baseboards?)\b/i.test(part) &&
    !/\b(install(?:ation|ing)?|replace(?:ment|ing)?|repair(?:ing|s)?|construct(?:ion|ing)?|build(?:ing)?|frame|blocking)\s+(?:\w+\s+){0,2}(framing|blocking|baseboards?|trim|casing|crown|doors?|cabinets?|carpentry)\b/i.test(part)
  ) {
    return true
  }
  if (rule.id === "demolition" && DEMOLITION_LIMITING_CONTEXT_PATTERN.test(part)) {
    return true
  }
  if (rule.id === "electrical") {
    if (ELECTRICAL_COVER_PLATE_PAINTING_CONTEXT_PATTERN.test(part)) return true
    if (ELECTRICAL_COVER_PLATE_GENERATED_CONTEXT_PATTERN.test(part)) return true
    if (ELECTRICAL_COVER_PLATE_REPLACEMENT_CONTEXT_PATTERN.test(part)) return true
    if (ELECTRICAL_COVER_PLATE_COORDINATION_CONTEXT_PATTERN.test(part)) return true
    if (ELECTRICAL_COVER_PLATE_UNAFFECTED_CONTEXT_PATTERN.test(part)) return true
    if (ELECTRICAL_COVER_PLATE_LIMITED_HANDLING_CONTEXT_PATTERN.test(part)) return true
    if (ELECTRICAL_MASKING_CONTEXT_ONLY_PATTERN.test(part) && !ELECTRICAL_TRUE_WORK_PATTERN.test(part)) return true
  }

  if (!NON_SCOPE_CONTEXT_PATTERN.test(part)) return false

  if (rule.id === "flooring") {
    return FLOORING_CONTEXT_ONLY_PATTERN.test(part) && !FLOORING_TRUE_WORK_PATTERN.test(part)
  }
  if (rule.id === "electrical") {
    return ELECTRICAL_CONTEXT_ONLY_PATTERN.test(part) && !ELECTRICAL_TRUE_WORK_PATTERN.test(part)
  }
  if (rule.id === "plumbing") {
    return PLUMBING_CONTEXT_ONLY_PATTERN.test(part) && !PLUMBING_TRUE_WORK_PATTERN.test(part)
  }
  if (rule.id === "carpentry") {
    return CARPENTRY_CONTEXT_ONLY_PATTERN.test(part) && !CARPENTRY_TRUE_WORK_PATTERN.test(part)
  }

  return false
}

function hasActionableMention(rule: TradeRule, resultText: string, args: BuildCustomerScopeTradeDriftWarningArgs) {
  return sentenceParts(resultText).some((part) => {
    if (!rule.mentionPattern.test(part)) return false
    if (EXCLUDED_TRADE_PATTERN.test(part)) return false
    if (isNonScopeContextMention(part, rule)) return false
    if (
      rule.id === "demolition" &&
      /\bprior\s+to\s+demolition\b/i.test(part) &&
      hasSupportedCarpentryReplacementRemovalContext(resultText, args)
    ) {
      return false
    }
    if (rule.id === "bathroom_tile" && /\bbathrooms?\b/i.test(part) && !rule.supportPattern.test(part)) return false
    if (rule.id === "electrical" && /\bfixtures?\b/i.test(part) && !rule.supportPattern.test(part)) return false
    if (rule.id === "plumbing" && /\bfixtures?\b/i.test(part) && !rule.supportPattern.test(part)) return false
    if (isNormalSupportedRemoval(part, rule, args)) return false
    return true
  })
}

function isTradeSupported(rule: TradeRule, args: BuildCustomerScopeTradeDriftWarningArgs) {
  return (
    selectedTradeSupports(rule, args.selectedTrade) ||
    writtenScopeSupports(rule, args.writtenScope) ||
    pricedSectionsSupport(rule, args.estimateSections) ||
    scopeXRaySupports(rule, args.scopeXRay) ||
    planReadbackSupports(rule, args.planIntelligence)
  )
}

function formatTradeList(trades: string[]) {
  if (trades.length <= 1) return trades[0] || ""
  if (trades.length === 2) return `${trades[0]} and ${trades[1]}`
  return `${trades.slice(0, -1).join(", ")}, and ${trades[trades.length - 1]}`
}

function addWarning(warnings: CustomerScopeReviewWarning[], warning: CustomerScopeReviewWarning) {
  const key = `${warning.label} ${warning.message}`.toLowerCase()
  if (warnings.some((item) => `${item.label} ${item.message}`.toLowerCase() === key)) return
  warnings.push(warning)
}

function unsupportedTradeRules(args: BuildCustomerScopeTradeDriftWarningArgs) {
  return TRADE_RULES.filter(
    (rule) => hasActionableMention(rule, args.resultText, args) && !isTradeSupported(rule, args)
  )
}

function tradeExclusionConflict(rule: TradeRule, args: BuildCustomerScopeTradeDriftWarningArgs) {
  const writtenExcludesTrade = sentenceParts(args.writtenScope).some(
    (part) => EXCLUDED_TRADE_PATTERN.test(part) && rule.supportPattern.test(part)
  )
  const facts = writtenScopeFacts(args)
  if (!writtenExcludesTrade && !factsExcludeTrade(facts, rule) && !factsContextOnlyTrade(facts, rule)) return false
  if (selectedTradeSupports(rule, args.selectedTrade)) return false
  if (writtenScopeSupports(rule, args.writtenScope)) return false

  if (rule.id === "electrical") {
    return sentenceParts(args.resultText).some(
      (part) => ELECTRICAL_TRUE_WORK_PATTERN.test(part) && !EXCLUDED_TRADE_PATTERN.test(part)
    )
  }
  if (rule.id === "plumbing") {
    return sentenceParts(args.resultText).some(
      (part) => PLUMBING_SYSTEM_PATTERN.test(part) && !EXCLUDED_TRADE_PATTERN.test(part)
    )
  }

  return hasActionableMention(rule, args.resultText, args)
}

function hasWallFloorRepairExclusionConflict(args: BuildCustomerScopeTradeDriftWarningArgs) {
  const writtenExcludesRepair = sentenceParts(args.writtenScope).some(
    (part) =>
      EXCLUDED_TRADE_PATTERN.test(part) &&
      /\b(wall|walls|floor|floors|flooring|drywall|sheetrock|carpentry|repair|repairs)\b/i.test(part)
  )

  return (
    writtenExcludesRepair &&
    sentenceParts(args.resultText).some(
      (part) => WALL_FLOOR_REPAIR_PATTERN.test(part) && !EXCLUDED_TRADE_PATTERN.test(part)
    )
  )
}

function hasPaintingAdjacentExpansion(args: BuildCustomerScopeTradeDriftWarningArgs) {
  const paintingRule = TRADE_RULES.find((rule) => rule.id === "painting")
  const drywallRule = TRADE_RULES.find((rule) => rule.id === "drywall")
  if (!paintingRule || !drywallRule) return false
  if (!isTradeSupported(paintingRule, args)) return false
  if (isTradeSupported(drywallRule, args)) return false
  if (MINOR_PAINT_PATCH_PATTERN.test(args.resultText) && !PAINTING_ADJACENT_DRYWALL_PATTERN.test(args.resultText)) {
    return false
  }

  return sentenceParts(args.resultText).some(
    (part) =>
      PAINTING_ADJACENT_DRYWALL_PATTERN.test(part) &&
      !EXCLUDED_TRADE_PATTERN.test(part) &&
      !isNonScopeContextMention(part, drywallRule)
  )
}

function hasFlooringAdjacentExpansion(args: BuildCustomerScopeTradeDriftWarningArgs) {
  const flooringRule = TRADE_RULES.find((rule) => rule.id === "flooring")
  const paintingRule = TRADE_RULES.find((rule) => rule.id === "painting")
  const carpentryRule = TRADE_RULES.find((rule) => rule.id === "carpentry")
  if (!flooringRule || !paintingRule || !carpentryRule) return false
  if (!isTradeSupported(flooringRule, args)) return false

  return sentenceParts(args.resultText).some((part) => {
    if (EXCLUDED_TRADE_PATTERN.test(part)) return false
    if (!FLOORING_ADJACENT_PATTERN.test(part)) return false
    const mentionsPainting = /\b(painting\s+(walls?|trim|baseboards?)|paint\s+(walls?|trim|baseboards?))\b/i.test(part)
    const mentionsCarpentry =
      /\b(baseboard\s+(replacement|replace|install|installation|repair)|baseboards?\s+(replacement|replace|install|installation|repair)|carpentry\s+work|trim\s+install|casing|crown)\b/i.test(part)

    return (
      (mentionsPainting && !isTradeSupported(paintingRule, args)) ||
      (mentionsCarpentry && !isTradeSupported(carpentryRule, args))
    )
  })
}

function buildUnsupportedTradeSummary(unsupportedTrades: TradeRule[]) {
  if (unsupportedTrades.length === 0) return null

  const visibleTradeLabels = unsupportedTrades.slice(0, 2).map((rule) => rule.label)
  const extraCount = unsupportedTrades.length - visibleTradeLabels.length
  const tradeText =
    extraCount > 0
      ? `${formatTradeList(visibleTradeLabels)} and ${extraCount} other trade${extraCount === 1 ? "" : "s"}`
      : formatTradeList(visibleTradeLabels)

  return `Customer-Facing Scope mentions ${tradeText} work, but ${visibleTradeLabels.length === 1 && extraCount === 0 ? "that trade is" : "those trades are"} not strongly supported by the selected trade, written scope, priced sections, or plan readback. Review this wording before sending.`
}

export function buildCustomerScopeReviewGuard(
  args: BuildCustomerScopeTradeDriftWarningArgs
): CustomerScopeReviewGuard {
  if (!String(args.resultText || "").trim()) {
    return { summary: null, warnings: [] }
  }

  const warnings: CustomerScopeReviewWarning[] = []
  const unsupportedTrades = unsupportedTradeRules(args)

  for (const rule of TRADE_RULES) {
    if (!tradeExclusionConflict(rule, args)) continue

    addWarning(warnings, {
      label: "Excluded scope conflict",
      message: `Written scope appears to exclude ${rule.label} work, but Customer-Facing Scope includes ${rule.label} system work. Review before sending.`,
      details: [`Confirm whether ${rule.label} work is excluded, by others, or actually included before customer output.`],
    })
  }

  if (hasWallFloorRepairExclusionConflict(args)) {
    addWarning(warnings, {
      label: "Excluded repair conflict",
      message:
        "Written scope appears to exclude wall, floor, drywall, flooring, or carpentry repair, but Customer-Facing Scope includes repair wording. Review before sending.",
      details: ["Confirm excluded repairs are not being promised in the customer-facing scope."],
    })
  }

  if (hasPaintingAdjacentExpansion(args)) {
    addWarning(warnings, {
      label: "Adjacent drywall expansion",
      message:
        "Customer-Facing Scope appears to expand a painting scope into drywall repair, skim coat, texture match, or finish-level work without strong support.",
      details: ["Minor nail-hole patching is okay, but drywall finishing or texture work should be confirmed before sending."],
    })
  }

  if (hasFlooringAdjacentExpansion(args)) {
    addWarning(warnings, {
      label: "Adjacent flooring expansion",
      message:
        "Customer-Facing Scope appears to expand a flooring scope into baseboard replacement, painting, or carpentry work without strong support.",
      details: ["Base shoe and transitions are okay when scoped; baseboard replacement, painting, or carpentry should be confirmed before sending."],
    })
  }

  if (unsupportedTrades.length > 0) {
    addWarning(warnings, {
      label: "Unsupported trade wording",
      message: buildUnsupportedTradeSummary(unsupportedTrades) || "",
      details: unsupportedTrades
        .slice(0, 2)
        .map((rule) => `Generated customer scope mentions ${rule.label} work without strong typed, priced, or plan-readback support.`),
    })
  }

  const unsupportedSummary = buildUnsupportedTradeSummary(unsupportedTrades)
  const hasElectricalUnsupported = unsupportedTrades.some((rule) => rule.id === "electrical")
  const electricalConflict = warnings.find(
    (warning) => warning.label === "Excluded scope conflict" && /\belectrical\b/i.test(warning.message)
  )
  const summary =
    electricalConflict
      ? electricalConflict.message
      : hasElectricalUnsupported && unsupportedSummary
      ? unsupportedSummary
      : warnings[0]?.label === "Excluded scope conflict"
      ? warnings[0].message
      : warnings[0]?.message || unsupportedSummary

  return {
    summary: summary || null,
    warnings,
  }
}

export function buildCustomerScopeTradeDriftWarning(args: BuildCustomerScopeTradeDriftWarningArgs): string | null {
  return buildCustomerScopeReviewGuard(args).summary
}
