"""Authored synthetic construction-scene workload; not real photos or model evidence.
Requires installed Pillow, reportlab and pypdf. Writes only a NEW external directory.
Images vary in texture, framing and geometry; this measures local byte/decoder work,
not hosted capacity or image interpretation. Each run writes its actual manifest.
"""
import os, sys, json, random, time, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
if len(sys.argv)!=2: raise SystemExit('Usage: project-package-generate.py NEW_TEMP_DIRECTORY')
destination=Path(sys.argv[1]).expanduser().resolve()
if destination.exists(): raise SystemExit('Refusing to overwrite an existing fixture directory.')
repository=Path(__file__).resolve().parents[2]
if destination==repository or repository in destination.parents: raise SystemExit('Keep bulky fixtures outside the repository.')
destination.mkdir(parents=True)
root=destination/'package'
(root/'Site Photos'/'Level 1').mkdir(parents=True,exist_ok=True)
(root/'Site Photos'/'Level 2').mkdir(parents=True,exist_ok=True)
for sub in ['Plans','Specifications','Schedules','Addenda','Supporting']:(root/sub).mkdir(exist_ok=True)
started=time.monotonic()
for i in range(400):
    rng=random.Random(41000+i)
    w,h=(2048,1536) if i%4 else (1536,2048)
    noise=Image.effect_noise((w,h),rng.uniform(38,63)).convert('RGB')
    base=Image.new('RGB',(w,h),(rng.randrange(120,195),rng.randrange(115,190),rng.randrange(95,175)))
    image=Image.blend(base,noise,.34)
    draw=ImageDraw.Draw(image)
    van=(int(w*rng.uniform(.35,.65)),int(h*rng.uniform(.35,.6)))
    draw.polygon([(0,h),(w,h),van],fill=(rng.randrange(55,110),rng.randrange(55,110),rng.randrange(45,95)))
    for j in range(16):
        x=int(w*j/15);draw.line([van,(x,h)],fill=(105+j*3,100+j*2,90+j*2),width=2)
    for j in range(4,22):
        y=int(h*.5+(h*.5)*(j/22)**1.5);draw.line([(0,y),(w,y)],fill=(90,86,76),width=2)
    for j in range(rng.randrange(7,15)):
        x=rng.randrange(w-200); y=rng.randrange(int(h*.15),int(h*.65));bw=rng.randrange(25,180);bh=rng.randrange(40,360)
        draw.rectangle([x,y,min(w,x+bw),min(h,y+bh)],outline=(65,70,74),width=6)
        if j%3==0:draw.rectangle([x+8,y+8,min(w,x+bw-5),min(h,y+bh-5)],fill=(rng.randrange(50,140),rng.randrange(70,150),rng.randrange(100,180)))
    for j in range(35):
        x,y=rng.randrange(w),rng.randrange(h);draw.line([(x,y),(min(w,x+rng.randrange(10,90)),min(h,y+rng.randrange(4,70)))],fill=(rng.randrange(80,160),rng.randrange(80,160),rng.randrange(70,150)),width=rng.randrange(1,5))
    draw.rectangle([20,20,w-20,85],fill=(25,38,49));draw.text((40,42),f'SYNTHETIC CONSTRUCTION SCENE {i+1:03d} - generated QA image, not customer/photo evidence',fill='white')
    level='Level 1' if i<200 else 'Level 2'
    image.save(root/'Site Photos'/level/f'IMG_{i+1:04d}.jpg',quality=94,subsampling=0)
    if (i+1)%50==0:print(f'Generated {i+1}/400 distinct images',flush=True)

def pdf(path,pages):
    c=canvas.Canvas(str(path),pagesize=letter,pageCompression=1)
    for number,lines in enumerate(pages,1):
        c.setFont('Helvetica-Bold',15);c.drawString(42,750,'SYNTHETIC PROJECT PACKAGE - NOT CUSTOMER DATA')
        c.setFont('Helvetica',10);y=720
        for line in lines:c.drawString(42,y,line);y-=18
        c.drawString(42,30,f'Synthetic source page {number}');c.showPage()
    c.save()
room1=['Room: Room 101','Length: 12 ft','Width: 10 ft','Wall height: 8 ft','Wall finish: paint','Ceiling finish: paint','Substrate: drywall','Condition: repaint','Coats: 2','Openings area: 62 sqft']
room2=['Room: Room 102','Length: 15 ft','Width: 12 ft','Wall height: 9 ft','Wall finish: paint','Ceiling finish: paint','Substrate: drywall','Condition: repaint','Coats: 2','Openings area: 46 sqft']
pdf(root/'Plans'/'Room dimensions.pdf',[room1,room2])
pdf(root/'Specifications'/'Painting specification.pdf',[[f'Synthetic specification section {i+1}','Substrate and preparation conditions must match the approved pricing profile.','Ceilings and walls are distinct surfaces.','Do not measure dimensions from the drawing scale in this test.'] for i in range(4)])
pdf(root/'Schedules'/'Finish schedule.pdf',[['Room: Room 103','Wall finish: paint','Substrate: drywall','Condition: new','Coats: 2','Lower-wall extent and dimensions are not supplied.'],['Room: Room 104','Net wall area: 250 sqft','Wall finish: wallcovering','Substrate: drywall','Condition: repaint','Coats: 2']])
pdf(root/'Addenda'/'Addendum 01.pdf',[['Synthetic addendum: Room 105 scope remains pending.','No dimensions or approved costs are supplied.'],['No room location may be inferred from a site-photo count.']])
# A real raster-only PDF retains visual detail while its lack of text stays visible.
image=Image.open(root/'Site Photos'/'Level 1'/'IMG_0002.jpg').convert('RGB')
image.save(root/'Supporting'/'Raster supporting sheet.pdf','PDF',resolution=150)
(root/'Supporting'/'GC request.txt').write_text('SYNTHETIC GC REQUEST\nAdd painting to the revised Room 101 wall scope. Scope agreement must be selected explicitly.\n')
(root/'Supporting'/'Malformed.pdf').write_bytes(b'%PDF-1.7\nSYNTHETIC TRUNCATED DOCUMENT\n')
(root/'Supporting'/'Unsupported.dwg').write_bytes(b'AC1032'+os.urandom(131072))
def add_dense_documents(root):
    c=canvas.Canvas(str(root/'Plans'/'Synthetic drawing set.pdf'),pagesize=letter,pageCompression=1)
    for page in range(32):
        rng=random.Random(7700+page);c.setFont('Helvetica-Bold',12);c.drawString(30,764,f'SYNTHETIC DRAWING A-{page+1:03d} - NOT A REAL PLAN')
        c.setFont('Helvetica',7);c.drawString(30,748,'Printed diagram geometry is not an implemented takeoff source. Use explicit schedules for quantities.')
        for row in range(6):
            for col in range(4):
                x=32+col*138;y=115+row*101;w=120-rng.randrange(12);h=85-rng.randrange(12)
                c.rect(x,y,w,h);c.rect(x+5,y+5,w-10,h-10);c.line(x+w/2,y,x+w/2,y+h)
                c.drawString(x+8,y+h-12,f'SPACE S{page+1}-{row*4+col+1}')
                for line in range(8):c.line(x+8,y+10+line*7,x+w-8,y+10+line*7)
                c.drawString(x+8,y-8,f'{rng.randrange(10,28)} ft diagram annotation')
        if page%4==0:
            photo=root/'Site Photos'/'Level 1'/f'IMG_{page+2:04d}.jpg'
            c.drawImage(str(photo),32,35,width=120,height=65,preserveAspectRatio=True)
        c.drawString(180,55,f'Sheet {page+1}/32. Source-backed drawing measurement requires a separate implemented capability.');c.showPage()
    c.save()
    c=canvas.Canvas(str(root/'Specifications'/'Synthetic detailed specification.pdf'),pagesize=letter,pageCompression=1)
    for page in range(40):
        c.setFont('Helvetica-Bold',12);c.drawString(30,760,f'SYNTHETIC SPECIFICATION SECTION 09-{page+1:03d}')
        c.setFont('Helvetica',8)
        for line in range(65):
            c.drawString(30,742-line*10,f'{page+1}.{line+1:02d} Contractor shall verify substrate preparation, finish extent, access and exclusions for the selected work.')
        c.drawString(30,40,'This synthetic supporting text does not supply room dimensions, approved quantities or company costs.');c.showPage()
    c.save()
    c=canvas.Canvas(str(root/'Schedules'/'Synthetic project roster.pdf'),pagesize=letter,pageCompression=1)
    for page in range(20):
        c.setFont('Helvetica-Bold',12);c.drawString(30,760,f'SYNTHETIC PROJECT ROSTER {page+1}/20')
        c.setFont('Helvetica',8)
        for row in range(40):
            y=738-row*16;c.line(30,y-4,580,y-4);c.drawString(35,y,f'ZONE {page+1:02d}-{row+1:03d}');c.drawString(145,y,'Unconfirmed location');c.drawString(300,y,'Scope and dimensions pending');c.drawString(475,y,'NO TAKEOFF')
        c.showPage()
    c.save()
    c=canvas.Canvas(str(root/'Supporting'/'Synthetic raster sheets.pdf'),pagesize=letter,pageCompression=1)
    for page in range(4):
        photo=root/'Site Photos'/'Level 2'/f'IMG_{201+page:04d}.jpg'
        c.drawImage(str(photo),0,0,width=612,height=792,mask='auto');c.showPage()
    c.save()

add_dense_documents(root)
files=[]
from pypdf import PdfReader
for p in sorted(root.rglob('*')):
    if not p.is_file():continue
    data=p.read_bytes();entry={'path':str(p.relative_to(root)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    if p.suffix=='.jpg':
        im=Image.open(p);entry.update(width=im.width,height=im.height,format=im.format)
    if p.suffix=='.pdf':
        try:entry['pages']=len(PdfReader(p).pages)
        except Exception:entry['pages']=None;entry['malformed']=True
    files.append(entry)
report={'synthetic':True,'constructionScenesNotRealPhotos':True,'files':files,'fileCount':len(files),'imageCount':sum(p['path'].endswith('.jpg') for p in files),'bytes':sum(p['bytes'] for p in files),'pdfPages':sum(p.get('pages') or 0 for p in files),'elapsedSeconds':time.monotonic()-started}
(root.parent/'package-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='files'}),flush=True)

# A separate large PNG exercises a genuine partial 6 MiB transfer.
scene=Image.open(root/'Site Photos'/'Level 1'/'IMG_0001.jpg').resize((4096,3072))
noise=Image.effect_noise((4096,3072),45).convert('RGB')
Image.blend(scene,noise,.3).save(destination/'resume-photo.png')
import zipfile
with zipfile.ZipFile(destination/'small-project-package.zip','w',compression=zipfile.ZIP_DEFLATED) as archive:
    archive.write(root/'Plans'/'Room dimensions.pdf','Plans/Room dimensions.pdf')
    archive.write(root/'Supporting'/'GC request.txt','Requests/GC request.txt')
