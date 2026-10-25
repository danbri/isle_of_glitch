5 REM touch: left right up down space=FIRE w=FASTER s=SLOWER j=JUMP h=HYPER c=DOCK b=BUY 1 2 3 4 5 6 7 l=LOADER
10 REM ======================== VECTOR TRADER: a tribute to Elite ========================
20 REM After Ian Bell and David Braben's Elite (1984): a whole galaxy grown from a few numbers,
30 REM wireframe ships with hidden lines, trading between worlds, pirates, and docking with a
40 REM spinning station. Like the original, you never move: the universe turns around you.
45 REM The galaxy, its names, the ships and the words here are all new, made by this program.
50 REM Docked:  1 launch  2 market  3 equipment  4 local chart  5 galaxy  6 world data  7 status
60 REM Flying:  arrows roll and pitch (down climbs, as a pilot pulls back)  W/S faster/slower
65 REM          SPACE fire  J jump drive  H hyperspace to the chosen world  C docking computer
70 REM          4-7 charts and data, 1 back to the view.   L: the loader, any time
75 REM
80 REM   100 setup   300 title   400 docked   1000 launch   1050 a system's space   1100 the flight loop
85 REM  1200 controls   1300 the universe turns   1400 ships   1500 drawing   1600 one wireframe
90 REM  1700 sun and planet   1800 space dust   1900 dashboard and scanner   2000 lasers   2100 docking
92 REM  2200 hyperspace   2400 messages   2500 the tunnel   2900 screens: 3100 market  3300 equipment
94 REM  3500 charts   3700 world data   3800 status   4000 the galaxy   4500 random numbers
96 REM  4600 names   4700 descriptions   4750 market prices   4800 ship shapes   4900 the commander
100 REM ======================== setup ========================
110 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS: PRINT AT 10,6; INK 5; "GROWING A GALAXY..."
120 LET systems=128: DIM sysx(systems): DIM sysy(systems): DIM econ(systems): DIM gov(systems): DIM tech(systems): DIM pop(systems): DIM sysseed(systems): DIM visits(systems): DIM name$(systems)
130 LET syls=32: DIM syl$(syls): RESTORE 6000: FOR i=1 TO syls: READ syl$(i): NEXT i
140 DIM econ$(8): DIM gov$(8): RESTORE 6010: FOR i=1 TO 8: READ econ$(i): NEXT i: FOR i=1 TO 8: READ gov$(i): NEXT i
150 LET goods=14: DIM good$(goods): DIM base(goods): DIM grad(goods): DIM spread(goods): DIM price(goods): DIM forsale(goods): DIM hold(goods)
155 RESTORE 6100: FOR i=1 TO goods: READ good$(i),base(i),grad(i),spread(i): NEXT i
160 DIM adj$(10): DIM thing$(10): RESTORE 6200: FOR i=1 TO 10: READ adj$(i): NEXT i: FOR i=1 TO 10: READ thing$(i): NEXT i
170 LET notes=48: DIM waltz(notes): RESTORE 6300: FOR i=1 TO notes: READ waltz(i): NEXT i
175 SPRITE "cross","....g....","....g....","....g....",".........","ggg...ggg",".........","....g....","....g....","....g...."
176 REM ship shapes (see 4800 and 5000): up to 64 corners and 40 faces of up to 6 corners; corner k of face f is fv(m,(f-1)*6+k)
177 LET models=4: DIM mverts(models): DIM mfaces(models): DIM medges(models): DIM mvx(models,64): DIM mvy(models,64): DIM mvz(models,64)
178 DIM fsize(models,40): DIM fmat(models,40): DIM fv(models,240): DIM fnx(models,40): DIM fny(models,40): DIM fnz(models,40): DIM ev1(models,128): DIM ev2(models,128): DIM ef1(models,128): DIM ef2(models,128)
179 DIM hullr(models): DIM hullg(models): DIM hullb(models): DIM accr(models): DIM accg(models): DIM accb(models): DIM edgecol(models): DIM shipname$(models)
180 GO SUB 4800
190 LET galaxy=1: GO SUB 4000
200 REM the things in space around us: 1 is the station, the rest are ships (kind 2) or wreckage (kind 99)
210 LET most=6: DIM kind(most): DIM posx(most): DIM posy(most): DIM posz(most): DIM nosex(most): DIM nosey(most): DIM nosez(most)
220 DIM roofx(most): DIM roofy(most): DIM roofz(most): DIM sidex(most): DIM sidey(most): DIM sidez(most): DIM life(most): DIM veer(most): DIM shape(most): DIM ord(most)
230 LET dusts=20: DIM dustx(dusts): DIM dusty(dusts): DIM dustz(dusts)
235 REM far-off stars: just directions, so they turn with us but never come nearer
236 LET stars=60: DIM starx(stars): DIM stary(stars): DIM starz(stars)
237 FOR i=1 TO stars: LET a=RND*2*PI: LET z=RND*2-1: LET q=SQR (1-z*z): LET starx(i)=q*COS a: LET stary(i)=q*SIN a: LET starz(i)=z: NEXT i
240 DIM cornx(64): DIM corny(64): DIM cornz(64): DIM scrx(64): DIM scry(64): DIM seen(40)
250 LET zoom=128: LET planetr=6000: LET sunr=9000: LET lastk$="": LET msg$="": LET shown$="": LET msgt=0
260 GO SUB 4900
300 REM ======================== title: the ships of the galaxy, turning in space ========================
310 CLS: FX "clear": FX "lineStyle": LET docked=1
320 PRINT AT 1,9; INK 6; "VECTOR TRADER"
330 PRINT AT 3,7; INK 5; "a tribute to Elite": PRINT AT 4,2; INK 5; "by Ian Bell and David Braben": PRINT AT 5,10; INK 5; "(1984)"
340 PRINT AT 16,2; INK 7; "PRESS SPACE OR TAP, COMMANDER"
350 PRINT AT 18,1; INK 4; "arrows steer, W/S speed": PRINT AT 19,1; INK 4; "SPACE fire, J jump drive": PRINT AT 20,1; INK 4; "H hyperspace, C dock, L loader"
360 LET o=most: LET kind(o)=2: LET posx(o)=0: LET posy(o)=-6: LET posz(o)=330: LET nosex(o)=0: LET nosey(o)=0: LET nosez(o)=1
370 LET roofx(o)=0: LET roofy(o)=1: LET roofz(o)=0: LET sidex(o)=1: LET sidey(o)=0: LET sidez(o)=0
375 LET sunx=-9000: LET suny=9000: LET sunz=-20000: LET show=1: LET t=0
380 REPEAT: LET t=t+1: IF t-160*INT (t/160)=1 THEN GO SUB 398
381 FX "clear": LET a=0.03
382 LET vx=nosex(o): LET vy=nosey(o): LET vz=nosez(o): GO SUB 395: LET nosex(o)=vx: LET nosey(o)=vy: LET nosez(o)=vz
384 LET vx=roofx(o): LET vy=roofy(o): LET vz=roofz(o): GO SUB 395: LET roofx(o)=vx: LET roofy(o)=vy: LET roofz(o)=vz
386 LET vx=sidex(o): LET vy=sidey(o): LET vz=sidez(o): GO SUB 395: LET sidex(o)=vx: LET sidey(o)=vy: LET sidez(o)=vz
388 GO SUB 1600: IF KEY "l" THEN LOADER
390 HALT: UNTIL KEY " " OR KEY CHR$ 13 OR MOUSEB
392 LET kind(o)=0: GO TO 400
395 REM turn (vx,vy,vz) about the vertical by angle a, and tip it a little towards us
396 LET t2=vx*COS a+vz*SIN a: LET vz=vz*COS a-vx*SIN a: LET vx=t2
397 LET t2=vy*COS (a/3)-vz*SIN (a/3): LET vz=vy*SIN (a/3)+vz*COS (a/3): LET vy=t2: RETURN
398 REM ---- the next ship in the line-up, at a distance that suits its size ----
399 LET show=show+1-models*(show=models): LET shape(o)=show: LET posz(o)=330+1500*(show=1): LET posy(o)=-0.13*posz(o): PRINT AT 14,0; "                                ": PRINT AT 14,INT (16-LEN shipname$(show)/2); INK 6; shipname$(show): RETURN
400 REM ======================== docked at the station: the screens ========================
410 LET docked=1: LET screen=7
420 REPEAT
430 IF screen=1 THEN GO TO 1000
440 IF screen=2 THEN GO SUB 3100
445 IF screen=3 THEN GO SUB 3300
450 IF screen=4 THEN GO SUB 3500
455 IF screen=5 THEN GO SUB 3510
460 IF screen=6 THEN GO SUB 3700
465 IF screen=7 THEN GO SUB 3800
470 UNTIL 0
1000 REM ======================== launch: down the tunnel and out, with the station behind us ========================
1010 LET docked=0: GO SUB 2500
1020 LET launching=1: GO SUB 1050: GO TO 1100
1050 REM ======================== set up the space around world "here" ========================
1052 FOR o=1 TO most: LET kind(o)=0: NEXT o
1054 REM the station's slot always faces the planet; after a launch we have just come out of it
1056 IF launching THEN LET planetx=0: LET planety=0: LET planetz=30000: LET sunx=-40000: LET suny=20000: LET sunz=-50000: LET o=1: LET ax=0: LET ay=0: LET az=-700: LET dx=0: LET dy=0: LET dz=1: LET k=1: GO SUB 1080
1058 IF NOT launching THEN LET planetx=0: LET planety=0: LET planetz=48000: LET sunx=-40000: LET suny=20000: LET sunz=-30000: LET o=1: LET ax=9000: LET ay=0: LET az=40000: LET dx=-9000: LET dy=0: LET dz=8000: LET k=1: GO SUB 1080
1060 REM pirates wait at the edge of lawless systems: more in anarchies, none in corporate states
1062 LET n=0: IF NOT launching THEN LET n=INT ((7-gov(here))/2.5): IF RND<0.35 THEN LET n=0
1064 FOR p=1 TO n: GO SUB 1090: NEXT p
1065 LET inbound=1: GO SUB 1094: LET inbound=0: GO SUB 1094
1066 FOR d=1 TO dusts: GO SUB 1840: NEXT d
1068 LET speed=10+5*(1-launching): LET shield=100: LET energy=100: LET heat=0: LET cool=0: LET hyperc=0: LET hyper=0: LET dead=0: LET docked=0: LET auto=0: LET frame=0: LET view=1: LET shotflash=0
1070 GO SUB 1950: LET msg$=name$(here): LET msgt=60
1072 RETURN
1080 REM ---- object o becomes kind k at (ax,ay,az), facing along (dx,dy,dz); its shape is model k unless we change it ----
1081 LET kind(o)=k: LET shape(o)=k: LET posx(o)=ax: LET posy(o)=ay: LET posz(o)=az: LET life(o)=3: LET veer(o)=0
1082 LET d=SQR (dx*dx+dy*dy+dz*dz): LET nosex(o)=dx/d: LET nosey(o)=dy/d: LET nosez(o)=dz/d
1083 LET roofx(o)=0: LET roofy(o)=1: LET roofz(o)=0: IF ABS nosey(o)>0.9 THEN LET roofx(o)=1: LET roofy(o)=0
1085 REM ---- square up: make the roof at right angles to the nose, and the side at right angles to both ----
1086 LET dp=roofx(o)*nosex(o)+roofy(o)*nosey(o)+roofz(o)*nosez(o)
1087 LET roofx(o)=roofx(o)-dp*nosex(o): LET roofy(o)=roofy(o)-dp*nosey(o): LET roofz(o)=roofz(o)-dp*nosez(o)
1088 LET d=SQR (roofx(o)*roofx(o)+roofy(o)*roofy(o)+roofz(o)*roofz(o)): LET roofx(o)=roofx(o)/d: LET roofy(o)=roofy(o)/d: LET roofz(o)=roofz(o)/d
1089 LET sidex(o)=roofy(o)*nosez(o)-roofz(o)*nosey(o): LET sidey(o)=roofz(o)*nosex(o)-roofx(o)*nosez(o): LET sidez(o)=roofx(o)*nosey(o)-roofy(o)*nosex(o): RETURN
1090 REM ---- a pirate, somewhere ahead, turning towards us: a Jackal, or now and then a tougher Wyvern ----
1091 FOR o=2 TO most: IF kind(o)=0 THEN LET ax=(RND-0.5)*7000: LET ay=(RND-0.5)*3000: LET az=5000+RND*5000: LET dx=-ax: LET dy=-ay: LET dz=-az: LET k=2: GO SUB 1080: LET shape(o)=2+2*(RND<0.4): LET life(o)=3+2*(shape(o)=4): LET o=most
1092 NEXT o: RETURN
1094 REM ---- a trader (kind 3): coming in to the station from out in space, or just leaving it through the slot ----
1095 FOR o=2 TO most: IF kind(o)<>0 THEN GO TO 1098
1096 IF inbound THEN LET ax=posx(1)+(RND-0.5)*16000: LET ay=posy(1)+(RND-0.5)*6000: LET az=posz(1)+(RND-0.5)*16000: LET dx=posx(1)-ax: LET dy=posy(1)-ay: LET dz=posz(1)-az
1097 IF NOT inbound THEN LET ax=posx(1)+nosex(1)*700: LET ay=posy(1)+nosey(1)*700: LET az=posz(1)+nosez(1)*700: LET dx=nosex(1): LET dy=nosey(1): LET dz=nosez(1)
1098 IF kind(o)=0 THEN LET k=3: GO SUB 1080: LET veer(o)=inbound: LET o=most
1099 NEXT o: RETURN
1100 REM ======================== in flight: the game loop, 25 times a second ========================
1110 REPEAT
1120 LET frame=frame+1: GO SUB 1200: GO SUB 1300: GO SUB 1400: GO SUB 2100
1130 FX "clear": SPRITE CLEAR: GO SUB 1700: GO SUB 1800: GO SUB 1500: GO SUB 2000: GO SUB 1900: GO SUB 2400
1140 HALT: HALT
1150 UNTIL docked OR dead OR hyper OR view>1
1160 IF view>1 THEN LET screen=view: GO SUB 1170: LET view=1: GO SUB 1950: GO TO 1110
1162 IF docked THEN GO SUB 2500: GO SUB 4960: LET visits(here)=visits(here)+1: GO SUB 4750: GO TO 400
1164 IF hyper THEN GO SUB 2200: GO TO 1110
1166 GO TO 1190
1170 REM ---- charts and data in flight (time stands still); 1 goes back to the view ----
1172 REPEAT: IF screen=2 OR screen=3 THEN LET screen=7
1174 IF screen=4 THEN GO SUB 3500
1175 IF screen=5 THEN GO SUB 3510
1176 IF screen=6 THEN GO SUB 3700
1177 IF screen=7 THEN GO SUB 3800
1178 UNTIL screen=1: RETURN
1190 REM ======================== destroyed ========================
1191 FOR i=1 TO 40: FX "clear": FX "lineStyle", 1, #ffd040, 100: FOR q=1 TO 12: LET a=RND*2*PI: LET rr=i*4*RND: FX "moveTo", 128, 64: FX "lineTo", 128+rr*COS a, 64+rr*SIN a: NEXT q: TONE -12+RND*6: HALT: NEXT i
1192 PRINT AT 8,11; INK 2; "GAME OVER": FOR i=1 TO 100: HALT: NEXT i
1193 GO SUB 4900: GO TO 300
1200 REM ======================== the controls ========================
1210 LET turnroll=0.05*(KEY CHR$ 9-KEY CHR$ 8): LET turnpitch=0.035*(KEY CHR$ 10-KEY CHR$ 11)
1220 IF KEY "w" AND speed<30 THEN LET speed=speed+1
1225 IF KEY "s" AND speed>0 THEN LET speed=speed-1
1230 LET firing=0: IF KEY " " AND heat<90 AND cool=0 THEN LET firing=1: LET cool=4-2*beam: LET heat=heat+8-3*beam: TONE 20
1235 IF cool>0 THEN LET cool=cool-1
1236 IF heat>0 THEN LET heat=heat-0.5
1240 LET jumping=KEY "j"
1245 GO SUB 2950: IF k$="h" OR k$="H" THEN GO SUB 2250
1249 IF (k$="c" OR k$="C") AND auto=1 THEN LET auto=0: LET k$="": LET msg$="DOCKING COMPUTER OFF": LET msgt=40
1250 IF (k$="c" OR k$="C") AND dockcomp=1 AND auto=0 THEN GO SUB 1365
1252 IF (k$="c" OR k$="C") AND dockcomp=0 THEN LET msg$="NO DOCKING COMPUTER FITTED": LET msgt=40
1255 IF LEN k$=1 THEN IF CODE k$>=52 AND CODE k$<=55 THEN LET view=CODE k$-48
1260 IF k$="l" OR k$="L" THEN LOADER
1270 RETURN
1300 REM ======================== the universe turns and slides past: we never move, everything else does ========================
1305 LET push=speed: IF jumping THEN GO SUB 1381: IF NOT locked THEN LET push=speed+1500
1308 IF auto THEN GO SUB 1370
1310 IF turnroll=0 AND turnpitch=0 THEN GO TO 1340
1315 LET ca=COS turnroll: LET sa=SIN turnroll: LET cb=COS turnpitch: LET sb=SIN turnpitch
1320 LET vx=planetx: LET vy=planety: LET vz=planetz: GO SUB 1390: LET planetx=vx: LET planety=vy: LET planetz=vz
1322 LET vx=sunx: LET vy=suny: LET vz=sunz: GO SUB 1390: LET sunx=vx: LET suny=vy: LET sunz=vz
1325 FOR o=1 TO most: IF kind(o)=0 THEN GO TO 1335
1326 LET vx=posx(o): LET vy=posy(o): LET vz=posz(o): GO SUB 1390: LET posx(o)=vx: LET posy(o)=vy: LET posz(o)=vz
1327 LET vx=nosex(o): LET vy=nosey(o): LET vz=nosez(o): GO SUB 1390: LET nosex(o)=vx: LET nosey(o)=vy: LET nosez(o)=vz
1328 LET vx=roofx(o): LET vy=roofy(o): LET vz=roofz(o): GO SUB 1390: LET roofx(o)=vx: LET roofy(o)=vy: LET roofz(o)=vz
1329 LET vx=sidex(o): LET vy=sidey(o): LET vz=sidez(o): GO SUB 1390: LET sidex(o)=vx: LET sidey(o)=vy: LET sidez(o)=vz
1335 NEXT o
1337 FOR d=1 TO dusts: LET vx=dustx(d): LET vy=dusty(d): LET vz=dustz(d): GO SUB 1390: LET dustx(d)=vx: LET dusty(d)=vy: LET dustz(d)=vz: NEXT d
1338 FOR i=1 TO stars: LET vx=starx(i): LET vy=stary(i): LET vz=starz(i): GO SUB 1390: LET starx(i)=vx: LET stary(i)=vy: LET starz(i)=vz: NEXT i
1340 REM and forward: everything comes towards us
1342 LET planetz=planetz-push: LET sunz=sunz-push: FOR o=1 TO most: LET posz(o)=posz(o)-push: NEXT o
1344 FOR d=1 TO dusts: LET dustz(d)=dustz(d)-speed: NEXT d
1346 RETURN
1365 LET d=SQR (posx(1)*posx(1)+posy(1)*posy(1)+posz(1)*posz(1)): IF d>25000 THEN LET msg$="TOO FAR FROM THE STATION": LET msgt=50: RETURN
1366 LET auto=1: LET autot=0: LET msg$="DOCKING COMPUTER ON": LET msgt=60: RETURN
1370 REM ---- the docking computer flies us in, to a waltz: Johann Strauss II's Blue Danube (1866) ----
1371 LET autot=autot+1: LET n=1+INT (autot/6): LET n=n-notes*INT ((n-1)/notes): IF autot-6*INT (autot/6)=0 THEN IF waltz(n)<>99 THEN TONE waltz(n)
1372 REM steer: roll the station onto the up-down line of the view, then pitch towards it; behind us, just loop over
1373 LET x=posx(1): LET y=posy(1): LET z=posz(1): LET d=SQR (x*x+y*y+z*z): LET turnroll=0: LET turnpitch=0
1374 IF z<0 THEN LET turnpitch=0.035: GO TO 1378
1375 IF ABS x>0.04*z THEN LET turnroll=0.04*SGN x: IF y<0 THEN LET turnroll=-turnroll
1376 IF ABS y>0.04*z THEN LET turnpitch=0.03*SGN y
1378 LET speed=20: IF d<3000 THEN LET speed=10
1379 IF d<650 THEN LET docked=1
1380 RETURN
1381 REM ---- mass lock: the jump drive won't work near the station, a ship, or the planet ----
1383 LET locked=0: FOR o=1 TO most: IF kind(o)>0 THEN IF ABS posx(o)+ABS posy(o)+ABS posz(o)<15000 THEN LET locked=1
1385 NEXT o: IF SQR (planetx*planetx+planety*planety+planetz*planetz)<planetr*2.5 THEN LET locked=1
1387 IF locked THEN LET msg$="MASS LOCKED": LET msgt=10
1389 RETURN
1390 REM ---- turn one point (vx,vy,vz) with us: roll about the line of sight, then pitch ----
1392 LET t=vx*ca-vy*sa: LET vy=vx*sa+vy*ca: LET vx=t
1394 LET t=vy*cb-vz*sb: LET vz=vy*sb+vz*cb: LET vy=t: RETURN
1400 REM ======================== the station spins; pirates hunt ========================
1402 IF kind(1)<>1 THEN GO TO 1410
1404 LET c=COS 0.006: LET s=SIN 0.006: LET t=roofx(1)*c+sidex(1)*s: LET sidex(1)=sidex(1)*c-roofx(1)*s: LET roofx(1)=t
1406 LET t=roofy(1)*c+sidey(1)*s: LET sidey(1)=sidey(1)*c-roofy(1)*s: LET roofy(1)=t: LET t=roofz(1)*c+sidez(1)*s: LET sidez(1)=sidez(1)*c-roofz(1)*s: LET roofz(1)=t
1410 FOR o=2 TO most: IF kind(o)=2 THEN GO SUB 1430
1412 IF kind(o)=3 THEN GO SUB 1460
1415 IF kind(o)=99 THEN LET life(o)=life(o)-1: IF life(o)<=0 THEN LET kind(o)=0
1420 NEXT o
1422 IF frame-500*INT (frame/500)=0 AND RND<0.1+(7-gov(here))/14 THEN GO SUB 1090: LET msg$="CONTACT": LET msgt=40
1423 IF frame-300*INT (frame/300)=0 AND RND<0.6 THEN LET inbound=(RND<0.5): GO SUB 1094
1425 RETURN
1430 REM ---- one pirate: turn towards us (or away for a while after a close pass), fly on, and fire when lined up ----
1431 LET d=SQR (posx(o)*posx(o)+posy(o)*posy(o)+posz(o)*posz(o)): LET tx=-posx(o)/d: LET ty=-posy(o)/d: LET tz=-posz(o)/d
1432 LET aim=nosex(o)*tx+nosey(o)*ty+nosez(o)*tz
1433 IF veer(o)>0 THEN LET veer(o)=veer(o)-1: LET tx=-tx: LET ty=0.4-ty: LET tz=-tz
1434 IF d<900 AND veer(o)=0 THEN LET veer(o)=50
1435 LET nosex(o)=nosex(o)+0.07*(tx-nosex(o)): LET nosey(o)=nosey(o)+0.07*(ty-nosey(o)): LET nosez(o)=nosez(o)+0.07*(tz-nosez(o))
1436 LET n=SQR (nosex(o)*nosex(o)+nosey(o)*nosey(o)+nosez(o)*nosez(o)): LET nosex(o)=nosex(o)/n: LET nosey(o)=nosey(o)/n: LET nosez(o)=nosez(o)/n: GO SUB 1085
1437 LET posx(o)=posx(o)+nosex(o)*14: LET posy(o)=posy(o)+nosey(o)*14: LET posz(o)=posz(o)+nosez(o)*14
1438 IF veer(o)=0 AND d<4500 AND aim>0.96 AND RND<0.025 THEN GO SUB 2050
1439 RETURN
1460 REM ---- a trader minds its own business: arriving ones head for the station and vanish inside; leaving ones fly off ----
1461 IF veer(o)=0 THEN GO TO 1468
1462 LET tx=posx(1)-posx(o): LET ty=posy(1)-posy(o): LET tz=posz(1)-posz(o): LET d=SQR (tx*tx+ty*ty+tz*tz): IF d<700 THEN LET kind(o)=0: RETURN
1463 LET tx=tx/d: LET ty=ty/d: LET tz=tz/d
1464 LET nosex(o)=nosex(o)+0.03*(tx-nosex(o)): LET nosey(o)=nosey(o)+0.03*(ty-nosey(o)): LET nosez(o)=nosez(o)+0.03*(tz-nosez(o))
1465 LET n=SQR (nosex(o)*nosex(o)+nosey(o)*nosey(o)+nosez(o)*nosez(o)): LET nosex(o)=nosex(o)/n: LET nosey(o)=nosey(o)/n: LET nosez(o)=nosez(o)/n: GO SUB 1085
1468 LET posx(o)=posx(o)+nosex(o)*10: LET posy(o)=posy(o)+nosey(o)*10: LET posz(o)=posz(o)+nosez(o)*10
1469 IF ABS posx(o)+ABS posy(o)+ABS posz(o)>40000 THEN LET kind(o)=0
1470 RETURN
1500 REM ======================== draw what is out there, farthest first, so that nearer ships cover farther ones ========================
1502 LET count=0: FOR o=1 TO most: IF kind(o)>0 THEN LET count=count+1: LET ord(count)=o
1504 NEXT o
1506 FOR i=2 TO count: LET j=i
1507 IF j>1 THEN IF posz(ord(j-1))<posz(ord(j)) THEN LET t=ord(j): LET ord(j)=ord(j-1): LET ord(j-1)=t: LET j=j-1: GO TO 1507
1508 NEXT i
1510 FOR i=1 TO count: LET o=ord(i)
1512 IF kind(o)>=1 AND kind(o)<=3 AND posz(o)>60 AND posz(o)<60000 THEN GO SUB 1600
1515 IF kind(o)=99 AND posz(o)>60 THEN GO SUB 1580
1520 NEXT i: RETURN
1580 REM ---- wreckage: a cloud of sparks that spreads and fades ----
1582 FX "lineStyle", 1, #ffd040, life(o)*4: LET cx=128+posx(o)*zoom/posz(o): LET cy=64-posy(o)*zoom/posz(o): LET rr=(30-life(o))*3000/posz(o)
1584 FOR q=1 TO 12: LET a=RND*2*PI: LET sx=cx+rr*RND*COS a: LET sy=cy+rr*RND*SIN a: FX "moveTo", sx, sy: FX "lineTo", sx+1, sy+1: NEXT q
1586 FX "lineStyle", 1, #ffffff, 100: RETURN
1600 REM ======================== one ship, solid: faces that point at us are filled and lit by the sun, then every edge glows ========================
1602 LET m=shape(o): LET near=0
1604 LET lx=sunx-posx(o): LET ly=suny-posy(o): LET lz=sunz-posz(o): LET d=SQR (lx*lx+ly*ly+lz*lz): LET lx=lx/d: LET ly=ly/d: LET lz=lz/d
1605 REM each corner, from the ship's own axes (side, roof, nose) into ours; then perspective: divide by distance
1606 FOR v=1 TO mverts(m)
1608 LET a=mvx(m,v): LET b=mvy(m,v): LET c=mvz(m,v)
1610 LET cornx(v)=posx(o)+a*sidex(o)+b*roofx(o)+c*nosex(o): LET corny(v)=posy(o)+a*sidey(o)+b*roofy(o)+c*nosey(o): LET cornz(v)=posz(o)+a*sidez(o)+b*roofz(o)+c*nosez(o)
1612 IF cornz(v)>20 THEN LET scrx(v)=128+cornx(v)*zoom/cornz(v): LET scry(v)=64-corny(v)*zoom/cornz(v) ELSE LET near=1
1614 NEXT v
1616 REM a face can be seen if it points towards us: its outward direction, dotted with one of its corners, is negative
1618 FOR f=1 TO mfaces(m): LET a=fnx(m,f): LET b=fny(m,f): LET c=fnz(m,f): LET p=fv(m,(f-1)*6+1)
1620 LET nx=a*sidex(o)+b*roofx(o)+c*nosex(o): LET ny=a*sidey(o)+b*roofy(o)+c*nosey(o): LET nz=a*sidez(o)+b*roofz(o)+c*nosez(o)
1622 LET seen(f)=(nx*cornx(p)+ny*corny(p)+nz*cornz(p)<0): IF seen(f) AND NOT near THEN GO SUB 1650
1624 NEXT f
1626 REM the edges: a wide faint stroke, then a fine bright one on top of it, which looks like a glow
1628 FOR pass=1 TO 2: IF pass=1 THEN FX "lineStyle", 4, edgecol(m), 22 ELSE FX "lineStyle", 1, edgecol(m), 100
1630 FOR e=1 TO medges(m): LET a=ev1(m,e): LET b=ev2(m,e)
1632 IF (seen(ef1(m,e)) OR seen(ef2(m,e))) AND cornz(a)>20 AND cornz(b)>20 THEN FX "moveTo", scrx(a), scry(a): FX "lineTo", scrx(b), scry(b)
1634 NEXT e: NEXT pass: RETURN
1650 REM ---- fill face f: its colour comes from its material, and how squarely it faces the sun ----
1652 LET lit=nx*lx+ny*ly+nz*lz: IF lit<0 THEN LET lit=0
1654 LET lit=0.35+0.65*lit: LET mt=fmat(m,f)
1656 LET red=hullr(m)*lit: LET green=hullg(m)*lit: LET blue=hullb(m)*lit
1658 IF mt=1 THEN LET red=red*0.55: LET green=green*0.55: LET blue=blue*0.55
1660 IF mt=2 THEN LET red=accr(m)*lit: LET green=accg(m)*lit: LET blue=accb(m)*lit
1662 IF mt=3 THEN LET red=110: LET green=220: LET blue=255
1664 IF mt=4 THEN LET red=255: LET green=110+60*RND: LET blue=30
1666 IF mt=5 THEN LET red=255: LET green=240: LET blue=180
1668 IF mt=6 THEN LET red=14: LET green=20: LET blue=30
1670 FX "lineStyle": FX "beginFill", INT red*65536+INT green*256+INT blue, 100
1672 LET p=fv(m,(f-1)*6+1): FX "moveTo", scrx(p), scry(p)
1674 FOR k=2 TO fsize(m,f): LET p=fv(m,(f-1)*6+k): FX "lineTo", scrx(p), scry(p): NEXT k
1676 FX "endFill": RETURN
1700 REM ======================== the sun (a core in a halo) and the planet (lit on the side that faces the sun) ========================
1705 IF sunz>200 THEN LET rr=sunr*zoom/sunz: IF rr<400 THEN LET cx=128+sunx*zoom/sunz: LET cy=64-suny*zoom/sunz: FX "lineStyle": GO SUB 1720
1710 IF planetz>200 THEN LET rr=planetr*zoom/planetz: IF rr<900 THEN LET cx=128+planetx*zoom/planetz: LET cy=64-planety*zoom/planetz: GO SUB 1730
1715 RETURN
1720 FX "beginFill", #ff9a20, 10: LET rx=rr*1.9: LET ry=rx: GO SUB 4400: FX "endFill": FX "beginFill", #ffc040, 22: LET rx=rr*1.35: LET ry=rx: GO SUB 4400: FX "endFill"
1722 FX "beginFill", #ffe68a, 90+10*RND: LET rx=rr: LET ry=rr: GO SUB 4400: FX "endFill": RETURN
1730 REM the lit side: circles nudged towards the sun, each inside the last and a little brighter
1732 LET lx=sunx-planetx: LET ly=suny-planety: LET d=SQR (lx*lx+ly*ly)+0.001: LET lx=lx/d: LET ly=ly/d
1734 FX "lineStyle": FX "beginFill", #0c2a52, 100: LET rx=rr: LET ry=rr: GO SUB 4400: FX "endFill"
1736 LET sh=0.25: LET bcol=#1d5a96: GO SUB 1745: LET sh=0.45: LET bcol=#3d8ccc: GO SUB 1745: LET sh=0.62: LET bcol=#7cc4ee: GO SUB 1745
1738 FX "lineStyle", 1, #6fd3ff, 45: LET rx=rr: LET ry=rr: GO SUB 4400: LET ry=rr*0.3: GO SUB 4400: RETURN
1745 LET cx0=cx: LET cy0=cy: LET cx=cx0+lx*rr*sh: LET cy=cy0-ly*rr*sh: FX "beginFill", bcol, 55: LET rx=rr*(1-sh): LET ry=rx: GO SUB 4400: FX "endFill": LET cx=cx0: LET cy=cy0: RETURN
1800 REM ======================== distant stars (they only turn with us) and space dust (it streams past) ========================
1801 FX "lineStyle", 1, #8890a0, 100
1802 FOR i=1 TO stars: IF starz(i)>0.05 THEN LET sx=128+starx(i)*zoom/starz(i): LET sy=64-stary(i)*zoom/starz(i): IF sx>=0 AND sx<256 AND sy>=0 AND sy<128 THEN FX "moveTo", sx, sy: FX "lineTo", sx+0.6, sy
1803 NEXT i
1805 FX "lineStyle", 1, #e0e0e0, 100
1810 FOR d=1 TO dusts
1815 IF dustz(d)<40 THEN GO SUB 1840
1820 LET sx=128+dustx(d)*zoom/dustz(d): LET sy=64-dusty(d)*zoom/dustz(d)
1825 IF sx<0 OR sx>255 OR sy<0 OR sy>127 THEN GO SUB 1840: GO TO 1835
1830 FX "moveTo", sx, sy: FX "lineTo", sx+1, sy
1835 NEXT d: RETURN
1840 LET dustz(d)=600+RND*2400: LET dustx(d)=(RND-0.5)*dustz(d)*1.8: LET dusty(d)=(RND-0.5)*dustz(d): RETURN
1900 REM ======================== the dashboard: gauges, the 3D scanner, the compass ========================
1905 FX "lineStyle": LET bx=0: LET by=128: LET bw=256: LET bh=64: LET bcol=#000000: GO SUB 2190
1907 FX "lineStyle", 1, #c0c000, 100: FX "moveTo", 0, 128: FX "lineTo", 256, 128
1910 IF shield<100 THEN LET shield=shield+0.15
1911 IF energy<100 THEN LET energy=energy+0.1
1912 FX "lineStyle": LET bx=18: LET bh=5: LET bw=50*speed/30: LET by=129: LET bcol=#ffd040: GO SUB 2190
1913 LET bw=shield/2: LET by=137: LET bcol=#40c0ff: GO SUB 2190: LET bw=energy/2: LET by=145: LET bcol=#40ff60: GO SUB 2190
1914 LET bw=fuel*50/7: LET by=153: LET bcol=#ff9040: GO SUB 2190: LET bw=heat/2: LET by=161: LET bcol=#ff4040: GO SUB 2190
1920 REM the scanner: each ship sits at its place on an ellipse, on a stick as tall as it is high above or below us
1922 FX "lineStyle", 1, #00c000, 100: LET cx=128: LET cy=160: LET rx=56: LET ry=20: GO SUB 4400: FX "moveTo", 72, 160: FX "lineTo", 184, 160: FX "moveTo", 128, 140: FX "lineTo", 128, 180
1924 FOR o=1 TO most: IF kind(o)>=1 AND kind(o)<=3 THEN GO SUB 1940
1926 NEXT o
1930 REM the compass points to the station: green dot ahead, red behind
1932 FX "lineStyle", 1, #00c000, 100: LET cx=228: LET cy=150: LET rx=11: LET ry=11: GO SUB 4400
1934 IF kind(1)=1 THEN LET d=SQR (posx(1)*posx(1)+posy(1)*posy(1)+posz(1)*posz(1)): LET bx=226+9*posx(1)/d: LET by=148-9*posy(1)/d: LET bw=4: LET bh=4: LET bcol=#ff3030: IF posz(1)>0 THEN LET bcol=#30ff30
1935 IF kind(1)=1 THEN FX "lineStyle": GO SUB 2190
1938 RETURN
1940 LET sx=128+posx(o)/120: LET sy=160-posz(o)/400: IF ABS (sx-128)>56 OR ABS (sy-160)>20 THEN RETURN
1942 LET st=sy-posy(o)/300: IF st<132 THEN LET st=132
1943 IF st>190 THEN LET st=190
1944 LET bcol=#ff5050: IF kind(o)=1 THEN LET bcol=#50e0ff
1946 IF kind(o)=3 THEN LET bcol=#e0e040
1947 FX "lineStyle", 1, bcol, 100: FX "moveTo", sx, sy: FX "lineTo", sx, st: FX "lineStyle": LET bx=sx-1: LET by=st-1: LET bw=3: LET bh=2: GO SUB 2190: RETURN
1950 REM ---- the dashboard's labels, printed once ----
1955 CLS: SPRITE CLEAR: PRINT AT 16,0; INK 5; "SP": PRINT AT 17,0; INK 5; "SH": PRINT AT 18,0; INK 5; "EN": PRINT AT 19,0; INK 5; "FU": PRINT AT 20,0; INK 5; "LT": LET shown$="": RETURN
2000 REM ======================== the crosshair, our lasers, and enemy fire ========================
2005 FX "lineStyle", 1, #80ff80, 100: FX "moveTo", 119, 64: FX "lineTo", 124, 64: FX "moveTo", 132, 64: FX "lineTo", 137, 64: FX "moveTo", 128, 55: FX "lineTo", 128, 60: FX "moveTo", 128, 68: FX "lineTo", 128, 73
2010 IF firing THEN FX "lineStyle", 2, #ff5050, 100: FX "moveTo", 40, 127: FX "lineTo", 128, 64: FX "moveTo", 216, 127: FX "lineTo", 128, 64: GO SUB 2030
2015 IF shotflash>0 THEN LET shotflash=shotflash-1: FX "lineStyle", 2, #ffd040, 100: FX "moveTo", shotx, shoty: FX "lineTo", 128, 120
2020 RETURN
2030 REM ---- did we hit anything? A ship whose middle is near the crosshair, by its size at that distance ----
2032 FOR o=2 TO most: IF (kind(o)=2 OR kind(o)=3) AND posz(o)>60 AND posz(o)<7000 THEN LET rr=6+100*zoom/posz(o): IF ABS (posx(o)*zoom/posz(o))<rr AND ABS (posy(o)*zoom/posz(o))<rr THEN GO SUB 2040
2034 NEXT o: RETURN
2040 LET life(o)=life(o)-1-beam: TONE 0: IF life(o)>0 THEN RETURN
2041 IF kind(o)=3 THEN LET kind(o)=99: LET life(o)=25: LET msg$="YOU DESTROYED A TRADER!": LET msgt=50: TONE -12: RETURN
2042 LET kind(o)=99: LET life(o)=25: LET kills=kills+1: LET credits=credits+25: LET msg$="BOUNTY: 25 CR": LET msgt=50: TONE -12: RETURN
2050 REM ---- we are hit: the shields take it first, then the energy banks ----
2052 LET shotflash=4: LET shotx=128: LET shoty=10: IF posz(o)>60 THEN LET shotx=128+posx(o)*zoom/posz(o): LET shoty=64-posy(o)*zoom/posz(o)
2054 IF shield>0 THEN LET shield=shield-8 ELSE LET energy=energy-10
2056 IF shield<0 THEN LET shield=0
2058 TONE -10: IF energy<=0 THEN LET dead=1
2059 RETURN
2100 REM ======================== docking: come in slowly, through the slot, lined up with it ========================
2105 IF kind(1)<>1 THEN GO TO 2140
2106 LET d=SQR (posx(1)*posx(1)+posy(1)*posy(1)+posz(1)*posz(1)): IF d>4000 OR auto OR msgt>2 THEN GO TO 2113
2107 REM within 4000 of the station, say what to do next
2108 LET facing=-(nosex(1)*posx(1)+nosey(1)*posy(1)+nosez(1)*posz(1))/d: LET ahead=posz(1)/d: LET msgt=2
2109 LET msg$="LINED UP - GO IN": IF speed>14 THEN LET msg$="SLOW DOWN (S)"
2110 IF ABS roofy(1)<=0.8 THEN LET msg$="ROLL TO LINE UP THE SLOT"
2111 IF ahead<=0.85 THEN LET msg$="POINT AT THE STATION"
2112 IF facing<=0.8 THEN LET msg$="FLY ROUND TO THE SLOT SIDE"
2113 IF d>560 THEN GO TO 2140
2115 LET facing=-(nosex(1)*posx(1)+nosey(1)*posy(1)+nosez(1)*posz(1))/d: REM is the slot turned towards us?
2120 LET ahead=posz(1)/d: REM is the station straight ahead?
2124 IF auto THEN LET docked=1: RETURN
2125 IF facing>0.8 AND ahead>0.85 AND ABS roofy(1)>0.8 AND speed<=14 THEN LET docked=1: RETURN
2130 REM anything else is a collision: we bounce off it and lose shields
2132 LET shield=shield-40: IF shield<0 THEN LET energy=energy+shield: LET shield=0
2134 LET speed=0: LET bx=posx(1)/d*300: LET by=posy(1)/d*300: LET bw=posz(1)/d*300
2135 FOR o=1 TO most: LET posx(o)=posx(o)+bx: LET posy(o)=posy(o)+by: LET posz(o)=posz(o)+bw: NEXT o: LET planetz=planetz+bw: LET sunz=sunz+bw
2136 LET msg$="COLLISION": LET msgt=40: TONE -14: IF energy<=0 THEN LET dead=1
2140 REM flying into the planet or the sun is the end
2145 IF SQR (planetx*planetx+planety*planety+planetz*planetz)<planetr THEN LET dead=1
2150 IF SQR (sunx*sunx+suny*suny+sunz*sunz)<sunr THEN LET dead=1
2155 IF hyperc>0 THEN LET hyperc=hyperc-1: LET msg$="HYPERSPACE "+STR$ INT (hyperc/25+1): LET msgt=2: IF hyperc=0 THEN LET hyper=1
2160 RETURN
2190 REM ---- a filled box: bx, by (top-left), bw by bh, colour bcol ----
2192 FX "beginFill", bcol, 100: FX "moveTo", bx, by: FX "lineTo", bx+bw, by: FX "lineTo", bx+bw, by+bh: FX "lineTo", bx, by+bh: FX "endFill": RETURN
2200 REM ======================== through hyperspace to the chosen world ========================
2205 LET a=here: LET b=sel: GO SUB 2290: LET fuel=fuel-ly: LET here=sel: LET visits(here)=visits(here)+1: GO SUB 4750
2210 GO SUB 2500: LET launching=0: GO SUB 1050: RETURN
2250 REM ---- start the hyperspace countdown: only to a world within fuel range ----
2255 IF hyperc>0 THEN RETURN
2260 IF sel=here THEN LET msg$="CHOOSE A WORLD ON THE CHART (4)": LET msgt=50: RETURN
2265 LET a=here: LET b=sel: GO SUB 2290: IF ly>fuel THEN LET msg$="NOT ENOUGH FUEL": LET msgt=50: RETURN
2270 LET hyperc=75: RETURN
2290 REM ---- light years between worlds a and b: four map units to a light year ----
2292 LET ly=INT (SQR ((sysx(a)-sysx(b))*(sysx(a)-sysx(b))+(sysy(a)-sysy(b))*(sysy(a)-sysy(b)))*10/4+0.5)/10: RETURN
2400 REM ======================== messages, in the middle of the view ========================
2405 IF msgt>0 THEN LET msgt=msgt-1: IF msgt=0 THEN LET msg$=""
2410 IF msg$<>shown$ THEN PRINT AT 14,0; "                                ": PRINT AT 14,INT (16-LEN msg$/2); INK 6; msg$: LET shown$=msg$
2415 RETURN
2500 REM ======================== the tunnel: rings rushing towards us (launching, docking, hyperspace) ========================
2505 CLS: SPRITE CLEAR: LET shown$=""
2510 FOR i=1 TO 50: FX "clear": FX "lineStyle", 1, #ffffff, 100
2515 FOR j=0 TO 5: LET phase=i*2+j*8: LET phase=phase-48*INT (phase/48): LET rr=3*EXP (0.085*phase)
2520 FX "moveTo", 128-rr, 88-rr*0.6: FX "lineTo", 128+rr, 88-rr*0.6: FX "lineTo", 128+rr, 88+rr*0.6: FX "lineTo", 128-rr, 88+rr*0.6: FX "lineTo", 128-rr, 88-rr*0.6: NEXT j
2525 IF i-2*INT (i/2)=0 THEN TONE i/3-6
2530 HALT: NEXT i: FX "clear": RETURN
2900 REM ======================== a screen's heading, and the keys along the bottom ========================
2910 CLS: FX "clear": FX "lineStyle": SPRITE CLEAR: LET shown$=""
2912 PRINT AT 0,0; PAPER 1; INK 7; "                                ": PRINT AT 0,INT (16-LEN head$/2); PAPER 1; INK 7; head$
2914 IF docked THEN PRINT AT 21,1; INK 5; "1 GO  2 BUY  3 KIT  4-7 CHARTS"
2916 IF NOT docked THEN PRINT AT 21,1; INK 5; "1 VIEW  4,5 MAPS  6,7 INFO"
2918 RETURN
2950 REM ---- a key press: INKEY$ says which key is down; count it only when it first goes down ----
2955 LET k$=INKEY$: IF k$=lastk$ THEN LET k$="": RETURN
2960 LET lastk$=k$: RETURN
2970 REM ---- the keys every screen shares: 1-7 choose a screen, L goes to the loader ----
2975 IF k$="l" OR k$="L" THEN LOADER
2980 LET leave=0: IF LEN k$=1 THEN IF CODE k$>=49 AND CODE k$<=55 THEN LET screen=CODE k$-48: LET leave=1
2985 RETURN
3100 REM ======================== the market: up and down choose, B (or right) buys, S (or left) sells ========================
3110 LET head$=name$(here)+" MARKET": GO SUB 2900
3115 PRINT AT 2,1; INK 6; "GOODS"; TAB 14; "PRICE SALE HOLD"
3120 LET row=1: FOR i=1 TO goods: GO SUB 3180: NEXT i: GO SUB 3190
3125 REPEAT: GO SUB 2950: GO SUB 2970: IF leave THEN RETURN
3130 IF k$=CHR$ 11 AND row>1 THEN LET row=row-1: LET i=row+1: GO SUB 3180: LET i=row: GO SUB 3180
3135 IF k$=CHR$ 10 AND row<goods THEN LET row=row+1: LET i=row-1: GO SUB 3180: LET i=row: GO SUB 3180
3140 IF k$="b" OR k$="B" OR k$=CHR$ 9 THEN GO SUB 3170
3145 IF k$="s" OR k$="S" OR k$=CHR$ 8 THEN GO SUB 3175
3150 HALT: UNTIL 0
3170 LET i=row: IF credits>=price(i) AND forsale(i)>0 AND cargo<capacity THEN LET credits=credits-price(i): LET forsale(i)=forsale(i)-1: LET hold(i)=hold(i)+1: TONE 12: GO SUB 3180: GO SUB 3190: RETURN
3172 TONE -6: RETURN
3175 LET i=row: IF hold(i)>0 THEN LET credits=credits+price(i): LET forsale(i)=forsale(i)+1: LET hold(i)=hold(i)-1: TONE 7: GO SUB 3180: GO SUB 3190: RETURN
3177 TONE -6: RETURN
3180 REM ---- one line of the market, highlighted when chosen ----
3182 LET p=0: IF i=row THEN LET p=1
3183 LET pad$=good$(i)+"             "
3184 PRINT AT 3+i,0; PAPER p; INK 7; " "; pad$(1 TO 13); price(i); "   "; TAB 20; forsale(i); "  "; TAB 25; hold(i); "   ": RETURN
3190 LET cargo=0: FOR q=1 TO goods: LET cargo=cargo+hold(q): NEXT q: LET capacity=20+15*bigbay
3192 PRINT AT 19,1; INK 6; "CASH "; credits; " CR   HOLD "; cargo; "/"; capacity; " T   ": RETURN
3300 REM ======================== equipment ========================
3310 LET head$="EQUIP SHIP": GO SUB 2900: GO SUB 3190
3315 LET cost=INT ((7-fuel)*3+0.99)
3320 PRINT AT 3,1; INK 7; "F  fill the tank"; TAB 24; cost; " CR"
3325 PRINT AT 5,1; INK 7; "   docking computer"; TAB 24; INK 4; "FITTED"
3330 PRINT AT 7,1; INK 7; "C  bigger cargo bay"; TAB 24;: IF bigbay THEN PRINT INK 4; "FITTED" ELSE PRINT "400 CR"
3335 PRINT AT 9,1; INK 7; "B  beam laser"; TAB 24;: IF beam THEN PRINT INK 4; "FITTED" ELSE PRINT "600 CR"
3340 PRINT AT 12,1; INK 5; "fuel "; fuel; " light years"
3345 REPEAT: GO SUB 2950: GO SUB 2970: IF leave THEN RETURN
3350 IF (k$="f" OR k$="F") AND credits>=cost THEN LET credits=credits-cost: LET fuel=7: TONE 12: GO TO 3310
3355 IF (k$="d" OR k$="D") AND dockcomp=0 AND credits>=150 THEN LET credits=credits-150: LET dockcomp=1: TONE 12: GO TO 3310
3360 IF (k$="c" OR k$="C") AND bigbay=0 AND credits>=400 THEN LET credits=credits-400: LET bigbay=1: TONE 12: GO TO 3310
3365 IF (k$="b" OR k$="B") AND beam=0 AND credits>=600 THEN LET credits=credits-600: LET beam=1: TONE 12: GO TO 3310
3370 HALT: UNTIL 0
3500 REM ======================== charts: the arrows move the cursor; the nearest world is chosen ========================
3505 LET head$="LOCAL CHART": LET cz=4: LET ox=sysx(here)-32: LET oy=sysy(here)-15: GO TO 3520
3510 LET head$="GALACTIC CHART": LET cz=1: LET ox=0: LET oy=-8
3520 GO SUB 2900: FX "lineStyle"
3525 FOR s=1 TO systems: LET px=(sysx(s)-ox)*cz: LET py=(sysy(s)-oy)*cz: IF px<0 OR px>254 OR py<10 OR py>150 THEN GO TO 3540
3530 LET bx=px-1: LET by=py-1: LET bw=2+cz/2: LET bh=bw: LET bcol=#ffffff: IF s=here THEN LET bcol=#ff4040
3532 GO SUB 2190
3535 IF cz>1 AND py<150 AND INT (px/8)+1+LEN name$(s)<=32 THEN PRINT AT INT (py/8),INT (px/8)+1; INK 5; name$(s)
3540 NEXT s
3545 REM the fuel circle: how far we can jump
3550 FX "lineStyle", 1, #40ff40, 100: LET cx=(sysx(here)-ox)*cz: LET cy=(sysy(here)-oy)*cz: LET rx=fuel*4*cz: LET ry=rx: GO SUB 4400
3555 LET curx=sysx(sel): LET cury=sysy(sel): LET shownsel=0
3560 REPEAT: GO SUB 2950: GO SUB 2970: IF leave THEN RETURN
3565 LET curx=curx+(KEY CHR$ 9-KEY CHR$ 8)*2/cz: LET cury=cury+(KEY CHR$ 10-KEY CHR$ 11)*2/cz
3570 REM choose the world nearest the cursor
3572 LET bestd=99999: FOR s=1 TO systems: LET d=(sysx(s)-curx)*(sysx(s)-curx)+(sysy(s)-cury)*(sysy(s)-cury): IF d<bestd THEN LET bestd=d: LET sel=s
3574 NEXT s
3576 SPRITE CLEAR: SPRITE "cross", (curx-ox)*cz-4, (cury-oy)*cz-4
3578 IF sel<>shownsel THEN LET a=here: LET b=sel: GO SUB 2290: PRINT AT 19,0; "                                ": PRINT AT 19,1; INK 6; name$(sel); "  "; ly; " LY": LET shownsel=sel
3580 HALT: UNTIL 0
3700 REM ======================== what we know of the chosen world ========================
3705 LET head$="DATA ON "+name$(sel): GO SUB 2900: LET s=sel: LET a=here: LET b=sel: GO SUB 2290
3710 PRINT AT 2,1; INK 7; "distance   "; ly; " light years"
3715 PRINT AT 4,1; INK 7; "economy    "; econ$(econ(s)+1)
3720 PRINT AT 6,1; INK 7; "government "; gov$(gov(s)+1)
3725 PRINT AT 8,1; INK 7; "tech level "; tech(s)
3730 PRINT AT 10,1; INK 7; "population "; pop(s); " billion"
3735 GO SUB 4700: PRINT AT 13,0;: WRAP 1: PRINT INK 5; desc$: WRAP 0
3740 REPEAT: GO SUB 2950: GO SUB 2970: IF leave THEN RETURN
3745 HALT: UNTIL 0
3800 REM ======================== the commander's status ========================
3805 LET head$="COMMANDER STATUS": GO SUB 2900: GO SUB 3190
3810 PRINT AT 2,1; INK 7; "present system  "; name$(here)
3812 PRINT AT 3,1; INK 7; "hyperspace to   "; name$(sel)
3814 LET c$="DOCKED": IF NOT docked THEN LET c$="GREEN"
3815 FOR o=2 TO most: IF NOT docked AND kind(o)=2 THEN LET c$="RED"
3816 NEXT o
3817 PRINT AT 4,1; INK 7; "condition       "; c$
3818 PRINT AT 5,1; INK 7; "fuel            "; fuel; " light years"
3820 PRINT AT 6,1; INK 7; "cash            "; credits; " CR"
3822 GO SUB 3870: PRINT AT 7,1; INK 7; "rating          "; rate$
3824 PRINT AT 8,1; INK 7; "kills           "; kills
3826 PRINT AT 10,1; INK 6; "equipment": LET r=11: PRINT AT r,2; INK 7; "pulse laser": IF beam THEN PRINT AT r,2; INK 7; "beam laser "
3828 IF dockcomp THEN LET r=r+1: PRINT AT r,2; INK 7; "docking computer"
3830 IF bigbay THEN LET r=r+1: PRINT AT r,2; INK 7; "large cargo bay"
3832 PRINT AT 10,18; INK 6; "cargo": LET r=10: FOR i=1 TO goods: IF hold(i)>0 AND r<18 THEN LET r=r+1: PRINT AT r,18; INK 7; hold(i); " "; good$(i)
3834 NEXT i
3840 REPEAT: GO SUB 2950: GO SUB 2970: IF leave THEN RETURN
3845 HALT: UNTIL 0
3870 REM ---- a rating from the number of kills ----
3872 LET rate$="HARMLESS": IF kills>=8 THEN LET rate$="MOSTLY HARMLESS"
3874 IF kills>=16 THEN LET rate$="POOR"
3876 IF kills>=32 THEN LET rate$="AVERAGE"
3878 IF kills>=64 THEN LET rate$="ABOVE AVERAGE"
3880 IF kills>=128 THEN LET rate$="COMPETENT"
3882 IF kills>=512 THEN LET rate$="DANGEROUS"
3884 IF kills>=2560 THEN LET rate$="DEADLY"
3886 IF kills>=6400 THEN LET rate$="ELITE"
3888 RETURN
4000 REM ======================== grow the galaxy: every world comes from one seed number ========================
4010 FOR s=1 TO systems
4020 LET seed=s*2731+galaxy*977: LET seed=seed-65536*INT (seed/65536): LET sysseed(s)=seed
4030 GO SUB 4500: LET sysx(s)=8+INT (r*240/256)
4040 GO SUB 4500: LET sysy(s)=4+INT (r*120/256)
4050 GO SUB 4500: LET econ(s)=INT (r/32)
4060 GO SUB 4500: LET gov(s)=INT (r/32)
4070 GO SUB 4500: LET tech(s)=1+INT (r/64)+INT ((7-econ(s))/2)+INT (gov(s)/2)
4080 LET pop(s)=(tech(s)*3+gov(s)+econ(s)+2)/10
4090 GO SUB 4600: LET name$(s)=word$
4095 NEXT s
4096 REM home is the world nearest the middle of the map
4097 LET home=1: LET bestd=9999: FOR s=1 TO systems: LET d=ABS (sysx(s)-128)+ABS (sysy(s)-64): IF d<bestd THEN LET bestd=d: LET home=s
4098 NEXT s: RETURN
4400 REM ---- an ellipse at (cx,cy), radii rx and ry: eight curves, each bowed out to the corner of its slice ----
4410 FX "moveTo", cx+rx, cy
4420 FOR q=1 TO 8: LET a=q*PI/4: LET mid=a-PI/8: FX "curveTo", cx+rx*COS mid/COS (PI/8), cy+ry*SIN mid/COS (PI/8), cx+rx*COS a, cy+ry*SIN a: NEXT q
4430 RETURN
4500 REM ======================== the next random number, made the ZX81's way: seed = 75*(seed+1) MOD 65537 - 1 ========================
4510 LET seed=75*(seed+1): LET seed=seed-65537*INT (seed/65537)-1: LET r=INT (seed/256): RETURN
4600 REM ======================== a name of two to four syllables ========================
4610 GO SUB 4500: LET parts=2+INT (r/86): LET word$=""
4620 FOR q=1 TO parts: GO SUB 4500: LET word$=word$+syl$(1+INT (r/8)): NEXT q
4630 REM a capital first letter: capitals are 32 below their small letters
4640 LET word$=CHR$ (CODE word$-32)+word$(2 TO LEN word$): RETURN
4700 REM ======================== a sentence about world s, from its seed ========================
4710 LET seed=sysseed(s): FOR q=1 TO 9: GO SUB 4500: NEXT q
4720 GO SUB 4500: LET a1=1+INT (r*10/256): GO SUB 4500: LET t1=1+INT (r*10/256): GO SUB 4500: LET a2=1+INT (r*10/256): GO SUB 4500: LET t2=1+INT (r*10/256)
4730 LET desc$=name$(s)+" is famous for its "+adj$(a1)+" "+thing$(t1)+" and its "+adj$(a2)+" "+thing$(t2)+".": RETURN
4750 REM ======================== today's market at world "here": prices follow the economy, plus a little luck ========================
4760 LET seed=here*131+visits(here)*17+1: LET seed=seed-65536*INT (seed/65536)
4770 FOR i=1 TO goods: GO SUB 4500
4780 LET price(i)=INT (base(i)+grad(i)*econ(here)+r*spread(i)/256): IF price(i)<1 THEN LET price(i)=1
4790 GO SUB 4500: LET forsale(i)=INT (r/16): IF (grad(i)<0 AND econ(here)>=5) OR (grad(i)>0 AND econ(here)<=2) THEN LET forsale(i)=forsale(i)+15
4795 NEXT i: RETURN
4800 REM ======================== ship shapes: read from DATA; the edges, the way each face points, and inset panels are worked out here ========================
4805 RESTORE 5000: FOR m=1 TO models
4810 READ shipname$(m), corners, size, hullr(m), hullg(m), hullb(m), accr(m), accg(m), accb(m), er, eg, eb: LET edgecol(m)=er*65536+eg*256+eb
4815 LET mverts(m)=corners: FOR v=1 TO corners: READ a,b,c: LET mvx(m,v)=a*size: LET mvy(m,v)=b*size: LET mvz(m,v)=c*size: NEXT v
4820 LET mfaces(m)=0: LET medges(m)=0
4822 REM each face: how many corners (or 0 for a panel inset into an earlier face), its material, then its corners; -1 ends the ship
4824 READ n: IF n<0 THEN GO TO 4898
4826 LET mfaces(m)=mfaces(m)+1: LET f=mfaces(m): READ fmat(m,f)
4828 IF n>0 THEN LET fsize(m,f)=n: FOR k=1 TO n: READ fv(m,(f-1)*6+k): NEXT k: GO TO 4850
4830 REM an inset panel: the parent face's corners pulled in towards its middle, as new corners of its own
4832 READ parent, pct: LET fsize(m,f)=fsize(m,parent): LET mx=0: LET my=0: LET mz=0
4834 FOR k=1 TO fsize(m,parent): LET p=fv(m,(parent-1)*6+k): LET mx=mx+mvx(m,p): LET my=my+mvy(m,p): LET mz=mz+mvz(m,p): NEXT k
4836 LET mx=mx/fsize(m,parent): LET my=my/fsize(m,parent): LET mz=mz/fsize(m,parent)
4838 FOR k=1 TO fsize(m,parent): LET p=fv(m,(parent-1)*6+k): LET mverts(m)=mverts(m)+1: LET v=mverts(m)
4840 LET mvx(m,v)=mx+(mvx(m,p)-mx)*pct/100: LET mvy(m,v)=my+(mvy(m,p)-my)*pct/100: LET mvz(m,v)=mz+(mvz(m,p)-mz)*pct/100: LET fv(m,(f-1)*6+k)=v: NEXT k
4850 REM which way the face points: the cross product of two of its sides, one unit long, turned round if it points inwards
4852 LET a=fv(m,(f-1)*6+1): LET b=fv(m,(f-1)*6+2): LET c=fv(m,(f-1)*6+3)
4855 LET ux=mvx(m,b)-mvx(m,a): LET uy=mvy(m,b)-mvy(m,a): LET uz=mvz(m,b)-mvz(m,a): LET wx=mvx(m,c)-mvx(m,a): LET wy=mvy(m,c)-mvy(m,a): LET wz=mvz(m,c)-mvz(m,a)
4860 LET nx=uy*wz-uz*wy: LET ny=uz*wx-ux*wz: LET nz=ux*wy-uy*wx: LET d=SQR (nx*nx+ny*ny+nz*nz): LET nx=nx/d: LET ny=ny/d: LET nz=nz/d
4865 IF nx*mvx(m,a)+ny*mvy(m,a)+nz*mvz(m,a)<0 THEN LET nx=-nx: LET ny=-ny: LET nz=-nz
4870 LET fnx(m,f)=nx: LET fny(m,f)=ny: LET fnz(m,f)=nz
4875 REM every side of a face is an edge; an edge we have met before belongs to two faces
4880 FOR k=1 TO fsize(m,f): LET k2=k+1: IF k2>fsize(m,f) THEN LET k2=1
4885 LET a=fv(m,(f-1)*6+k): LET b=fv(m,(f-1)*6+k2): LET found=0
4890 FOR e=1 TO medges(m): IF (ev1(m,e)=a AND ev2(m,e)=b) OR (ev1(m,e)=b AND ev2(m,e)=a) THEN LET ef2(m,e)=f: LET found=1
4892 NEXT e
4894 IF found=0 THEN LET medges(m)=medges(m)+1: LET e=medges(m): LET ev1(m,e)=a: LET ev2(m,e)=b: LET ef1(m,e)=f: LET ef2(m,e)=f
4896 NEXT k: GO TO 4824
4898 NEXT m: RETURN
4900 REM ======================== the commander: KEPT brings back what KEEP saved the last time we docked (the docking computer is standard) ========================
4910 LET dockcomp=0: LET bigbay=0: LET beam=0
4920 IF KEPT "vt.saved"=0 THEN LET credits=100: LET fuel=7: LET here=home: LET kills=0: FOR i=1 TO goods: LET hold(i)=0: NEXT i: GO TO 4950
4930 LET credits=KEPT "vt.credits": LET fuel=KEPT "vt.fuel": LET here=KEPT "vt.here": LET kills=KEPT "vt.kills"
4935 LET dockcomp=KEPT "vt.dockcomp": LET bigbay=KEPT "vt.bigbay": LET beam=KEPT "vt.beam"
4940 FOR i=1 TO goods: LET hold(i)=KEPT ("vt.hold"+STR$ i): NEXT i
4950 LET dockcomp=1: LET sel=here: LET visits(here)=visits(here)+1: GO SUB 4750: GO SUB 3190: RETURN
4960 REM ---- save the commander (we do it every time we dock) ----
4970 KEEP "vt.saved",1: KEEP "vt.credits",credits: KEEP "vt.fuel",fuel: KEEP "vt.here",here: KEEP "vt.kills",kills
4975 KEEP "vt.dockcomp",dockcomp: KEEP "vt.bigbay",bigbay: KEEP "vt.beam",beam
4980 FOR i=1 TO goods: KEEP "vt.hold"+STR$ i,hold(i): NEXT i: RETURN
5000 REM ======================== the ships. Each: name, corners, size, hull colour (r,g,b), trim colour, edge colour;
5002 REM then its corners (x across, y up, z forwards); then its faces: how many corners, the material, which corners;
5004 REM or 0, the material, the face it is set into, and its size in percent (an inset panel); -1 ends the ship.
5006 REM Materials: 0 hull, 1 darker panel, 2 trim, 3 lit window, 4 engine glow, 5 lamp, 6 black
5010 REM the Orbital: a cuboctahedron (the middles of a cube's edges), a slot on the front, panels and lit windows
5012 DATA "ORBITAL  the station", 16, 400, 150,160,175, 220,80,60, 143,233,255
5020 DATA 1,1,0, 1,-1,0, -1,-1,0, -1,1,0
5030 DATA 1,0,1, 0,1,1, -1,0,1, 0,-1,1
5040 DATA 1,0,-1, 0,1,-1, -1,0,-1, 0,-1,-1
5050 DATA 0.35,0.1,1, -0.35,0.1,1, -0.35,-0.1,1, 0.35,-0.1,1
5060 DATA 4,0,5,6,7,8, 4,0,9,10,11,12, 4,0,1,5,2,9, 4,0,4,7,3,11, 4,0,1,6,4,10, 4,0,2,8,3,12
5070 DATA 3,0,1,6,5, 3,0,2,5,8, 3,0,4,7,6, 3,0,3,8,7, 3,0,1,9,10, 3,0,2,12,9, 3,0,4,10,11, 3,0,3,11,12
5080 DATA 4,6,13,14,15,16
5085 DATA 0,1,2,60, 0,1,3,60, 0,1,4,60, 0,1,5,60, 0,1,6,60
5090 DATA 0,3,7,35, 0,3,8,35, 0,3,9,35, 0,3,10,35, 0,3,11,35, 0,3,12,35, 0,3,13,35, 0,3,14,35, -1
5100 REM the Jackal: a pirate fighter with swept wings, a canopy, wing stripes and twin engines
5110 DATA "JACKAL  pirate fighter", 17, 2.2, 130,36,36, 245,200,60, 255,106,90
5120 DATA 0,2,60, -20,8,0, 20,8,0, -56,0,-34, 56,0,-34, -18,10,-34, 18,10,-34, -18,-8,-34, 18,-8,-34
5125 DATA -15,5,-34, -5,5,-34, -5,-5,-34, -15,-5,-34, 5,5,-34, 15,5,-34, 15,-5,-34, 5,-5,-34
5130 DATA 3,0,1,3,2, 4,0,2,3,7,6, 3,0,1,2,4, 3,0,1,5,3, 3,0,2,6,4, 3,0,3,5,7, 6,1,4,6,7,5,9,8, 3,0,1,4,8, 3,0,1,8,9, 3,0,1,9,5
5135 DATA 4,4,10,11,12,13, 4,4,14,15,16,17, 0,3,1,45, 0,2,3,40, 0,2,4,40, -1
5200 REM the Hauler: a trader's box with a bridge window, cargo bays, a stripe and four engines
5210 DATA "HAULER  trader", 24, 3, 96,116,84, 235,190,40, 255,215,106
5220 DATA -20,12,40, 20,12,40, 20,-12,40, -20,-12,40, -30,16,-40, 30,16,-40, 30,-16,-40, -30,-16,-40
5222 DATA -24,12,-40, -6,12,-40, -6,2,-40, -24,2,-40, 6,12,-40, 24,12,-40, 24,2,-40, 6,2,-40
5224 DATA -24,-2,-40, -6,-2,-40, -6,-12,-40, -24,-12,-40, 6,-2,-40, 24,-2,-40, 24,-12,-40, 6,-12,-40
5230 DATA 4,0,1,2,3,4, 4,1,5,6,7,8, 4,0,1,5,6,2, 4,0,4,3,7,8, 4,0,2,6,7,3, 4,0,1,4,8,5
5235 DATA 4,4,9,10,11,12, 4,4,13,14,15,16, 4,4,17,18,19,20, 4,4,21,22,23,24, 0,3,1,55, 0,1,5,70, 0,1,6,70, 0,2,3,30, -1
5240 REM the Wyvern: a pirate gunship, a long six-sided hull with a glowing exhaust ring
5250 DATA "WYVERN  pirate gunship", 13, 2.6, 72,60,118, 255,120,200, 200,138,255
5260 DATA 0,0,70, 10.4,4.2,40, 0,8.4,40, -10.4,4.2,40, -10.4,-4.2,40, 0,-8.4,40, 10.4,-4.2,40
5265 DATA 24.2,9.8,-40, 0,19.6,-40, -24.2,9.8,-40, -24.2,-9.8,-40, 0,-19.6,-40, 24.2,-9.8,-40
5270 DATA 3,0,1,2,3, 3,0,1,3,4, 3,0,1,4,5, 3,0,1,5,6, 3,0,1,6,7, 3,0,1,7,2
5275 DATA 4,0,2,8,9,3, 4,0,3,9,10,4, 4,0,4,10,11,5, 4,0,5,11,12,6, 4,0,6,12,13,7, 4,0,7,13,8,2, 6,1,8,9,10,11,12,13
5280 DATA 0,4,13,62, 0,6,14,40, 0,3,7,40, 0,3,8,40, 0,2,10,50, 0,2,11,50, -1
6000 DATA "la","ve","di","so","ri","ed","qu","at","ti","on","us","er","in","an","be","ce","or","za","ge","ma","ra","le","xe","te","is","ar","en","ou","al","es","ib","ox"
6010 DATA "Rich Industrial","Average Industrial","Poor Industrial","Mainly Industrial","Mainly Agricultural","Rich Agricultural","Average Agricultural","Poor Agricultural"
6015 DATA "Anarchy","Feudal","Multi-Government","Dictatorship","Communist","Confederacy","Democracy","Corporate State"
6100 REM goods: name, base price, change per step from industrial to agricultural, how much luck
6110 DATA "Food",10,-1,4, "Textiles",14,-1,4, "Radioactives",30,-2,6, "Liquor",22,-2,6, "Luxuries",80,6,12, "Computers",70,7,10, "Machinery",50,4,8
6120 DATA "Alloys",34,3,6, "Firearms",60,4,12, "Furs",46,-4,14, "Minerals",9,-1,3, "Gold",40,0,8, "Platinum",70,0,14, "Gem-stones",20,0,10
6200 DATA "ancient","edible","mad","vast","fabulous","exotic","deadly","bubbling","silly","mysterious"
6210 DATA "poets","sea monsters","volcanoes","cuisine","tree ants","dust storms","zero-g hockey","lizards","casinos","hot springs"
6300 REM the Blue Danube, in semitones from middle C; 99 is a rest
6310 DATA 2,2,6,9,9,99,21,21,99,18,18,99,2,2,6,9,9,99,21,21,99,19,19,99
6320 DATA 1,1,4,11,11,99,23,23,99,19,19,99,1,1,4,11,11,99,23,23,99,18,18,99
