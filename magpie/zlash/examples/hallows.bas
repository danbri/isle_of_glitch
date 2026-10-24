5 REM touch: up down left right space=JUMP t=TAKE l=LOADER
10 REM ======================== THE FOUR HALLOWS: an isometric quest ========================
20 REM Oisin is home from Tir na nOg, and the Four Hallows of the Tuatha De Danann lie scattered
30 REM over a little island of nine rooms. Bring all four to the golden altar in the shrine before
40 REM twenty days pass. In the manner of 1980s isometric games: flick-screen rooms drawn block by
50 REM block (Ultimate's Knight Lore), giant ants in a city of stone you can jump clear of (Ant Attack),
60 REM crates you pick up, carry from room to room and stack to climb on (Fairlight, Knight Lore), a sun
70 REM and moon keeping the days, and a Celtic quest with healing herbs and the sidhe abroad by night
80 REM (Tir Na Nog). The room is drawn with FX each frame, back to front, so blocks hide what is behind.
82 REM Speed: here a GO SUB costs more than drawing a dozen faces, so the game loop is one path of GO TOs,
84 REM the standing-room test says where to come back to in rt, and ellipses are written out where used.
86 REM
87 REM The lines run every frame come first (600-1230, then 2400-3110), so the compiler's split of this long
88 REM program into functions falls between the game and the drawing, and not in the middle of either.
89 REM
90 REM    100 setup   600 the loop   700 Oisin   800 standing room   900 ants and wraiths   1000 herbs, hallows, the altar
92 REM   1100 crates   1200 the days   1250 colours   1300 a new game   1400 into a room   1500 the end   2400 a frame
94 REM   2700 figures   3300 the panel   4000 the island   4500 the room as faces   5300 title   9000 the rooms
96 REM   arrows or Q A O P walk, SPACE or M jumps, T or ENTER takes and drops, L back to the loader
100 REM ======================== setup ========================
110 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
115 REM the isometric view: a cell is 24 pixels across and 12 down; a block is 12 pixels tall
120 LET hw=12: LET hh=6: LET bh=12: LET ox=128: LET oy=40: LET dl=1250: LET rr=0.28
125 REM the island: heights, the block at each level, floors (1 spikes, 2 water), and each room's colours
130 DIM ht(9,9,9): DIM bt(9,9,9,7): DIM fl(9,9,9): DIM rs(9,3): DIM rf(9,3): DIM rw(9,3): DIM rn$(9,24)
135 REM the room as a list of four-cornered faces in drawing order, and the colour of every kind of face
140 DIM qx(700,4): DIM qy(700,4): DIM qc(700): DIM qs(700): DIM pal(30)
145 REM ants and wraiths; hallows and herbs; and the figures sorted for drawing
150 DIM ek(12): DIM er(12): DIM ex(12): DIM ey(12): DIM ez(12): DIM eu(12): DIM ev(12): DIM ea(12): DIM ec(12)
155 DIM ik(10): DIM ir(10): DIM ix(10): DIM iy(10): DIM iz(10): DIM ig(10): DIM got(4): DIM hn$(4,25)
160 DIM ok(24): DIM oc(24)
165 REM an ellipse is eight curves; their control and end points round a unit circle
170 DIM ux(8): DIM uy(8): DIM vx(8): DIM vy(8)
175 FOR q=1 TO 8: LET an=q*PI/4: LET am=an-PI/8: LET ux(q)=COS am*1.0824: LET uy(q)=SIN am*1.0824: LET vx(q)=COS an: LET vy(q)=SIN an: NEXT q
180 RESTORE 9500: FOR k=1 TO 4: READ hn$(k): NEXT k
185 REM the panel's pictures: the sun and moon, and the hallows as you find them
190 EMOJI "☀️","sun",14: EMOJI "🌙","moon",14
192 SPRITE "hal1","...hhhh...","..hhhhh7..","..hhhh777.","..hhh7777.","..hhh7777.","..hh77777.","..hh77777.","..h777777.",".hh777777.","4444444444"
194 SPRITE "hal2",".........g","........gg",".......gg.","......2g..",".....2....","....2.....","...2......","..2.......",".2........","2........."
196 SPRITE "hal3","....h.....","...hh7....","...hh7....","...hh7....","...hh7....","...hh7....",".gggggg...","....2.....","....2.....","...ggg...."
198 SPRITE "hal4","..........","..........","6666666666",".77777777.","7777777777","7777777777",".77777777.","..777777..",".7......7.",".........."
199 GO TO 5300
600 REM ======================== the loop, 25 times a second: 700 Oisin, 900 the others, 1000 what he touches, 1200 the day, 2400 the frame, and back here ========================
610 IF en<=0 THEN GO TO 1500
615 IF day>20 THEN GO TO 1550
620 IF won THEN GO TO 1600
625 IF KEY "l" THEN LOADER
630 PAUSE 1
700 REM ======================== Oisin: walk the way the arrows point on the screen, jump, take ========================
705 LET dx=0: LET dy=0
710 IF KEY CHR$ 11 OR KEY "q" THEN LET dx=dx-1: LET dy=dy-1
715 IF KEY CHR$ 10 OR KEY "a" THEN LET dx=dx+1: LET dy=dy+1
720 IF KEY CHR$ 8 OR KEY "o" THEN LET dx=dx-1: LET dy=dy+1
725 IF KEY CHR$ 9 OR KEY "p" THEN LET dx=dx+1: LET dy=dy-1
730 IF dx=0 AND dy=0 THEN GO TO 760
735 LET d=SQR (dx*dx+dy*dy): LET dx=dx/d*0.11: LET dy=dy/d*0.11: LET wk=wk+1
740 IF ABS dx>=ABS dy THEN LET facex=SGN dx: LET facey=0
742 IF ABS dx<ABS dy THEN LET facex=0: LET facey=SGN dy
744 LET fw=0: IF dx+dy>=-0.001 THEN LET fw=1
745 REM one axis at a time, so he slides along walls; he can step down anywhere but must jump up
750 LET tx=px+dx: LET ty=py: LET rt=1: GO TO 800
751 IF bad=0 AND gh<=pz+0.05 AND NOT (wet=1 AND gh=0 AND pz<0.3) THEN LET px=tx
755 LET tx=px: LET ty=py+dy: LET rt=2: GO TO 800
756 IF bad=0 AND gh<=pz+0.05 AND NOT (wet=1 AND gh=0 AND pz<0.3) THEN LET py=ty
760 REM falling, landing, jumping
765 LET tx=px: LET ty=py: LET rt=3: GO TO 800
770 IF pz>gh+0.001 THEN LET vz=vz-0.07: LET pz=pz+vz: IF pz<=gh THEN LET pz=gh: LET vz=0: IF wet=1 AND gh=0 THEN GO TO 790
775 IF pz<gh THEN LET pz=gh: LET vz=0
780 IF pz=gh AND (KEY " " OR KEY "m") THEN LET vz=0.42: LET pz=pz+vz: TONE -2
782 IF KEY "t" OR KEY CHR$ 13 THEN IF tkheld=0 THEN LET tkheld=1: GO SUB 1100
784 IF NOT (KEY "t" OR KEY CHR$ 13) THEN LET tkheld=0
786 GO TO 795
790 REM into the water: back to the doorway, colder and weaker
792 LET en=en-10: LET px=entx: LET py=enty: LET pz=0: LET vz=0: LET msg$="SPLASH!": LET msgt=40: GO SUB 3500: TONE -15
795 IF px<0 THEN LET rm=rm-1: LET px=7.7: GO SUB 1400: GO TO 900
796 IF px>=8 THEN LET rm=rm+1: LET px=0.3: GO SUB 1400: GO TO 900
797 IF py<0 THEN LET rm=rm-3: LET py=7.7: GO SUB 1400: GO TO 900
798 IF py>=8 THEN LET rm=rm+3: LET py=0.3: GO SUB 1400
799 GO TO 900
800 REM ======================== standing room: the highest ground under a footprint of radius rr at (tx,ty) ========================
802 REM bad=1 if a corner is off the floor other than through a doorway; wet=1 if a corner is over water; then back to rt
805 LET gh=0: LET bad=0: LET wet=0: FOR q=0 TO 3: LET cx=tx-rr+2*rr*(q-2*INT (q/2)): LET cy=ty-rr+2*rr*INT (q/2)
810 IF cx<0 OR cx>=8 OR cy<0 OR cy>=8 THEN GO TO 820
812 LET ci=INT cx+1: LET cj=INT cy+1: LET h=ht(rm,ci,cj): IF h>gh THEN LET gh=h
814 IF fl(rm,ci,cj)=2 THEN LET wet=1
816 GO TO 830
820 LET dr=0: IF cy<0 AND rrow>0 AND cx>3 AND cx<5 THEN LET dr=1
822 IF cy>=8 AND rrow<2 AND cx>3 AND cx<5 THEN LET dr=1
824 IF cx<0 AND rcol>0 AND cy>3 AND cy<5 THEN LET dr=1
826 IF cx>=8 AND rcol<2 AND cy>3 AND cy<5 THEN LET dr=1
828 IF dr=0 THEN LET bad=1
830 NEXT q
835 IF rt=1 THEN GO TO 751
837 IF rt=2 THEN GO TO 756
839 GO TO 770
900 REM ======================== ants and wraiths ========================
905 LET e=0
906 LET e=e+1: IF e>ne THEN GO TO 1000
908 IF er(e)<>rm THEN GO TO 906
910 LET ea(e)=ea(e)+1: IF ek(e)=2 THEN GO TO 950
915 REM an ant smells Oisin when he is near and on the ground, and comes; otherwise it wanders. It cannot climb
920 LET ddx=px-ex(e): LET ddy=py-ey(e): LET d=SQR (ddx*ddx+ddy*ddy)+0.001: LET sp=0.07: IF lt<0.75 THEN LET sp=0.09
924 IF ec(e)>0 THEN LET ec(e)=ec(e)-1: LET eu(e)=-ddx/d*sp: LET ev(e)=-ddy/d*sp: GO TO 930
925 IF d<4.5 AND pz<0.9 THEN LET eu(e)=ddx/d*sp: LET ev(e)=ddy/d*sp
928 IF NOT (d<4.5 AND pz<0.9) AND RND<0.04 THEN LET an=RND*2*PI: LET eu(e)=COS an*sp*0.7: LET ev(e)=SIN an*sp*0.7
930 LET tx=ex(e)+eu(e): LET ty=ey(e): LET rt=4: GO TO 992
931 IF cango THEN LET ex(e)=tx
932 IF NOT cango THEN LET eu(e)=-eu(e)
933 LET tx=ex(e): LET ty=ey(e)+ev(e): LET rt=5: GO TO 992
934 IF cango THEN LET ey(e)=ty
935 IF NOT cango THEN LET ev(e)=-ev(e)
936 IF d<0.6 AND pz<0.6 AND ec(e)=0 THEN LET en=en-6: LET hurt=6: LET ec(e)=30
940 GO TO 906
950 REM a wraith of the sidhe floats up and down its line; by day it is a faint harmless shape
955 LET tx=ex(e)+eu(e): LET ty=ey(e)+ev(e): LET rt=6: GO TO 992
957 IF cango THEN LET ex(e)=tx: LET ey(e)=ty
958 IF NOT cango THEN LET eu(e)=-eu(e): LET ev(e)=-ev(e)
960 LET ez(e)=0.5+0.2*SIN (ea(e)/6)
965 LET ddx=px-ex(e): LET ddy=py-ey(e): IF ec(e)>0 THEN LET ec(e)=ec(e)-1
966 IF lt<0.75 AND ec(e)=0 AND ddx*ddx+ddy*ddy<0.4 AND ABS (pz-ez(e))<1 THEN LET en=en-8: LET hurt=6: LET ec(e)=40: LET eu(e)=-eu(e): LET ev(e)=-ev(e)
970 GO TO 906
990 REM can an ant or a wraith be at (tx,ty)? inside the room, over bare dry floor; then back to rt
992 LET cango=0: IF tx<0.35 OR tx>7.65 OR ty<0.35 OR ty>7.65 THEN GO TO 996
994 LET cango=1: FOR q=0 TO 3: LET ci=INT (tx-0.3+0.6*(q-2*INT (q/2)))+1: LET cj=INT (ty-0.3+0.6*INT (q/2))+1: IF ht(rm,ci,cj)>0 OR fl(rm,ci,cj)=2 THEN LET cango=0
995 NEXT q
996 IF rt=4 THEN GO TO 931
997 IF rt=5 THEN GO TO 934
998 GO TO 957
1000 REM ======================== herbs and hallows, spikes, the altar ========================
1005 FOR i=1 TO ni: IF ir(i)<>rm OR ig(i)=1 THEN GO TO 1040
1010 LET ddx=px-ix(i): LET ddy=py-iy(i): IF ddx*ddx+ddy*ddy>0.36 OR ABS (pz-iz(i))>0.9 THEN GO TO 1040
1015 LET ig(i)=1: IF ik(i)=5 THEN LET en=en+35: IF en>100 THEN LET en=100
1020 IF ik(i)=5 THEN LET msg$="A HEALING HERB": LET msgt=50: GO SUB 3500: TONE 12: TONE 16: GO TO 1040
1025 LET got(ik(i))=1: LET msg$=hn$(ik(i)): LET msgt=90: GO SUB 3500: GO SUB 3300: TONE 7: TONE 12: TONE 19
1040 NEXT i
1045 IF px<0 OR px>=8 OR py<0 OR py>=8 THEN GO TO 1080
1050 IF pz<0.05 AND fl(rm,INT px+1,INT py+1)=1 THEN LET en=en-0.5: IF hurt<2 THEN LET hurt=2
1055 REM on the golden altar with all four hallows, the quest is done
1060 IF rm=9 AND pz>0.9 AND bt(rm,INT px+1,INT py+1,1)=3 THEN GO SUB 1070
1065 GO TO 1080
1070 IF got(1)+got(2)+got(3)+got(4)=4 THEN LET won=1: RETURN
1072 IF msgt=0 THEN LET msg$="THE ALTAR WAITS FOR ALL FOUR": LET msgt=60: GO SUB 3500
1074 RETURN
1080 IF hurt=6 THEN TONE -20
1082 IF hurt>0 THEN BORDER 2: LET hurt=hurt-1: IF hurt=0 THEN BORDER 0
1090 IF msgt>0 THEN LET msgt=msgt-1: IF msgt=0 THEN GO SUB 3500
1095 GO TO 1200
1100 REM ======================== a crate: take the one in front at our level, or put ours down there ========================
1105 LET cx=px+facex*0.8: LET cy=py+facey*0.8: IF cx<0 OR cx>=8 OR cy<0 OR cy>=8 THEN GO TO 1190
1110 LET ci=INT cx+1: LET cj=INT cy+1: LET h=ht(rm,ci,cj): IF carry=1 THEN GO TO 1150
1115 IF h=0 THEN GO TO 1190
1120 IF bt(rm,ci,cj,h)<>2 OR ABS (h-1-pz)>0.6 THEN GO TO 1190
1125 LET bt(rm,ci,cj,h)=0: LET ht(rm,ci,cj)=h-1: LET carry=1: GO SUB 4500: TONE 12: RETURN
1150 REM down it goes, onto ground no higher than our feet, where nobody is standing
1155 IF h>pz+0.05 OR h>=7 THEN GO TO 1190
1160 LET occ=0: FOR q=0 TO 3: LET cx=px-rr+2*rr*(q-2*INT (q/2)): LET cy=py-rr+2*rr*INT (q/2): IF INT cx+1=ci AND INT cy+1=cj THEN LET occ=1
1162 NEXT q
1165 FOR e=1 TO ne: IF er(e)=rm AND INT ex(e)+1=ci AND INT ey(e)+1=cj THEN LET occ=1
1167 NEXT e
1170 FOR i=1 TO ni: IF ir(i)=rm AND ig(i)=0 AND INT ix(i)+1=ci AND INT iy(i)+1=cj THEN LET occ=1
1172 NEXT i
1175 IF occ THEN GO TO 1190
1180 LET ht(rm,ci,cj)=h+1: LET bt(rm,ci,cj,h+1)=2: LET carry=0: GO SUB 4500: TONE 7: RETURN
1190 TONE -10: RETURN
1200 REM ======================== the days: the sun, then the moon; at night the colours sink and the sidhe wake ========================
1205 LET ft=ft+1: LET day=INT (ft/dl)+1: LET ph=(ft-(day-1)*dl)/dl
1210 LET lt=1: IF ph>0.55 THEN LET lt=0.5: IF ph<0.62 THEN LET lt=1-0.5*(ph-0.55)/0.07
1215 IF ph<0.07 THEN LET lt=0.5+0.5*ph/0.07
1220 IF INT (lt*16)<>lq THEN LET lq=INT (lt*16): GO SUB 1250
1225 IF day<>dshown THEN GO SUB 3300
1227 IF INT (en/10+0.5)<>eb THEN GO SUB 3320
1229 IF ft-25*INT (ft/25)=0 THEN GO SUB 3340
1230 GO TO 2400
1250 REM ---- colours: each kind of block in three shades (top, left, right) for this room, in this light ----
1255 FOR t=1 TO 7: GO SUB 1280: FOR f=0 TO 2: LET fa=1
1260 IF f=1 THEN LET fa=0.74
1262 IF f=2 THEN LET fa=0.52
1265 LET cr=INT (br*fa*lt): LET cg=INT (bg*fa*lt): LET cb=INT (bb*fa*(lt+(1-lt)*0.6)): IF cb>255 THEN LET cb=255
1270 LET pal(t*3+f)=cr*65536+cg*256+cb: NEXT f: NEXT t: RETURN
1280 IF t=1 THEN LET br=rs(rm,1): LET bg=rs(rm,2): LET bb=rs(rm,3)
1282 IF t=2 THEN LET br=176: LET bg=112: LET bb=56
1284 IF t=3 THEN LET br=232: LET bg=184: LET bb=48
1286 IF t=4 THEN LET br=rw(rm,1): LET bg=rw(rm,2): LET bb=rw(rm,3)
1288 IF t=5 THEN LET br=rf(rm,1): LET bg=rf(rm,2): LET bb=rf(rm,3)
1290 IF t=6 THEN LET br=50: LET bg=100: LET bb=200
1292 IF t=7 THEN LET br=185: LET bg=185: LET bb=200
1294 RETURN
1300 REM ======================== a new game ========================
1305 CLS: SPRITE CLEAR: GO SUB 4000: LET titlemode=0
1310 LET rm=5: LET px=4.5: LET py=4.5: LET pz=0: LET vz=0: LET facex=1: LET facey=0: LET fw=1: LET en=100: LET carry=0
1315 LET ft=150: LET day=1: LET lq=-1: LET lt=1: LET ph=0.1: LET wk=0: LET won=0: LET msgt=0: LET tkheld=0: LET hurt=0
1320 GO SUB 1400: LET msg$="FIND THE FOUR HALLOWS": LET msgt=100: GO SUB 3500
1325 GO TO 700
1400 REM ======================== into room rm: its colours, its faces and the panel ========================
1405 LET rrow=INT ((rm-1)/3): LET rcol=rm-1-rrow*3
1410 GO SUB 1250: GO SUB 4500: GO SUB 3300: LET entx=px: LET enty=py: RETURN
1500 REM ======================== the end, one way or another ========================
1505 LET msg$="OISIN FALLS. THE ISLE SLEEPS.": GO TO 1560
1550 LET msg$="TWENTY DAYS HAVE PASSED."
1560 LET msgt=1: GO SUB 3500: BORDER 0: TONE -5, 0.3: TONE -9, 0.3: TONE -14, 0.8
1565 FOR k=1 TO 75: PAUSE 1: NEXT k
1570 REPEAT: PAUSE 1: UNTIL KEY " " OR KEY CHR$ 13
1575 REPEAT: PAUSE 1: UNTIL NOT (KEY " " OR KEY CHR$ 13)
1580 GO TO 5300
1600 REM the hallows rise from Oisin's hands and circle the altar
1605 LET titlemode=2: BORDER 0: SPRITE CLEAR: FOR k=18 TO 21: PRINT AT k,0; "                                ": NEXT k
1610 LET r=18: LET t$="THE FOUR HALLOWS ARE HOME!": LET n=6: GO SUB 3550: LET r=19: LET t$="THE ISLE WAKES FROM ITS SLEEP.": LET n=5: GO SUB 3550
1615 LET r=20: LET t$="IN "+STR$ day+" DAYS OF TWENTY.": LET n=7: GO SUB 3550: LET r=21: LET t$="PRESS SPACE": LET n=4: GO SUB 3550
1620 LET fz=0
1625 FOR k=1 TO 4: LET an=fz/30+k*PI/2: LET ir(k)=9: LET ig(k)=0: LET ix(k)=4+1.6*COS an: LET iy(k)=4+1.6*SIN an: LET iz(k)=2+0.4*SIN (fz/8+k): NEXT k
1630 IF fz-12*INT (fz/12)=0 AND fz<200 THEN TONE 7+5*INT (RND*4)
1635 LET ft=ft+1: LET fz=fz+1: GO TO 2400
1640 PAUSE 1: IF fz<60 OR NOT (KEY " " OR KEY CHR$ 13) THEN GO TO 1625
1645 GO TO 1575
2400 REM ======================== a frame: floor, grid, then faces and figures interleaved, back to front ========================
2405 FX "clear": FX "lineStyle", 1, 0, 100
2410 FOR p=1 TO nfl: FX "beginFill", pal(qc(p)), 100: FX "moveTo", qx(p,1), qy(p,1): FX "lineTo", qx(p,2), qy(p,2): FX "lineTo", qx(p,3), qy(p,3): FX "lineTo", qx(p,4), qy(p,4): FX "endFill": NEXT p
2415 FX "lineStyle", 1, 0, 18: FOR k=1 TO 7: FX "moveTo", ox+k*hw, oy+k*hh: FX "lineTo", ox+(k-8)*hw, oy+(k+8)*hh: FX "moveTo", ox-k*hw, oy+k*hh: FX "lineTo", ox+(8-k)*hw, oy+(8+k)*hh: NEXT k: FX "lineStyle", 1, 0, 100
2420 REM each figure is drawn just after the diagonal its cell is on
2422 LET na=0: IF titlemode<>1 THEN LET na=1: LET ok(1)=INT px+INT py+0.5: LET oc(1)=0
2424 FOR e=1 TO ne: IF er(e)=rm THEN LET na=na+1: LET ok(na)=INT ex(e)+INT ey(e)+0.5: LET oc(na)=100+e
2425 NEXT e
2426 FOR i=1 TO ni: IF ir(i)=rm AND ig(i)=0 THEN LET na=na+1: LET ok(na)=INT ix(i)+INT iy(i)+0.5: LET oc(na)=200+i
2427 NEXT i
2430 FOR a=2 TO na: LET k0=ok(a): LET c0=oc(a): LET b=a-1
2432 IF b>=1 THEN IF ok(b)>k0 THEN LET ok(b+1)=ok(b): LET oc(b+1)=oc(b): LET b=b-1: GO TO 2432
2434 LET ok(b+1)=k0: LET oc(b+1)=c0: NEXT a
2440 LET p=nfl+1: LET a=0
2442 LET a=a+1: IF a>na THEN GO TO 2455
2445 IF p<=nq THEN IF qs(p)<ok(a) THEN FX "beginFill", pal(qc(p)), 100: FX "moveTo", qx(p,1), qy(p,1): FX "lineTo", qx(p,2), qy(p,2): FX "lineTo", qx(p,3), qy(p,3): FX "lineTo", qx(p,4), qy(p,4): FX "endFill": LET p=p+1: GO TO 2445
2447 REM figure a: each one ends by going back to 2442 for the next
2450 LET oo=oc(a): IF oo=0 THEN GO TO 2700
2451 IF oo<200 THEN LET e=oo-100: IF ek(e)=1 THEN GO TO 2800
2452 IF oo<200 THEN GO TO 2900
2453 LET i=oo-200: LET sx=ox+(ix(i)-iy(i))*hw: LET sy=oy+(ix(i)+iy(i))*hh-iz(i)*bh: IF ik(i)<5 THEN LET hk=ik(i): LET sy=sy-3-2*SIN (ft/5): GO TO 3000
2454 GO TO 3100
2455 IF p<=nq THEN FX "beginFill", pal(qc(p)), 100: FX "moveTo", qx(p,1), qy(p,1): FX "lineTo", qx(p,2), qy(p,2): FX "lineTo", qx(p,3), qy(p,3): FX "lineTo", qx(p,4), qy(p,4): FX "endFill": LET p=p+1: GO TO 2455
2460 IF titlemode=1 THEN GO TO 5330
2462 IF titlemode=2 THEN GO TO 1640
2464 GO TO 610
2700 REM ---- Oisin: a shadow, legs, a green cloak with a gold belt, and fair hair ----
2705 LET sx=ox+(px-py)*hw: LET sy=oy+(px+py)*hh-pz*bh: LET gs=0: IF px>=0 AND px<8 AND py>=0 AND py<8 THEN LET gs=ht(rm,INT px+1,INT py+1)
2710 IF gs<=pz+0.05 THEN FX "lineStyle": FX "beginFill", 0, 40: LET ecx=sx: LET ecy=oy+(px+py)*hh-gs*bh: LET erx=6: LET ery=3: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill"
2715 LET sw=2.5*SIN (wk*0.8): FX "lineStyle", 2, #2a1e14, 100: FX "moveTo", sx-2, sy-7: FX "lineTo", sx-2-sw, sy-0.5: FX "moveTo", sx+2, sy-7: FX "lineTo", sx+2+sw, sy-0.5: FX "lineStyle", 1, 0, 100
2720 FX "beginFill", #2f8f46, 100: FX "moveTo", sx-6, sy-6: FX "lineTo", sx+6, sy-6: FX "lineTo", sx+4, sy-17: FX "lineTo", sx-4, sy-17: FX "lineTo", sx-6, sy-6: FX "endFill"
2722 FX "beginFill", #d8a830, 100: FX "moveTo", sx-5.2, sy-10: FX "lineTo", sx+5.2, sy-10: FX "lineTo", sx+5, sy-11.5: FX "lineTo", sx-5, sy-11.5: FX "endFill"
2725 IF fw=0 THEN FX "beginFill", #e0a020, 100: LET ecx=sx: LET ecy=sy-21.5: LET erx=4.2: LET ery=4.6: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill": GO TO 2735
2728 LET ew=SGN (facex-facey): FX "beginFill", #f0c090, 100: LET ecx=sx: LET ecy=sy-21: LET erx=4: LET ery=4.2: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill"
2730 FX "beginFill", #e0a020, 100: FX "moveTo", sx-4.2, sy-21: FX "curveTo", sx-4.5, sy-26.5, sx, sy-26.5: FX "curveTo", sx+4.5, sy-26.5, sx+4.2, sy-21: FX "lineTo", sx+2, sy-23.5: FX "lineTo", sx-2, sy-23.5: FX "lineTo", sx-4.2, sy-21: FX "endFill"
2732 FX "lineStyle", 1.5, 0, 100: FX "moveTo", sx-1.6+ew, sy-20.6: FX "lineTo", sx-1.6+ew, sy-19.6: FX "moveTo", sx+1.6+ew, sy-20.6: FX "lineTo", sx+1.6+ew, sy-19.6: FX "lineStyle", 1, 0, 100
2735 IF carry THEN LET mx=sx: LET my=sy-35: LET ms=5: LET c1=pal(6): LET c2=pal(7): LET c3=pal(8): FX "beginFill", c1, 100: FX "moveTo", mx, my-ms/2: FX "lineTo", mx+ms, my: FX "lineTo", mx, my+ms/2: FX "lineTo", mx-ms, my: FX "endFill": FX "beginFill", c2, 100: FX "moveTo", mx-ms, my: FX "lineTo", mx, my+ms/2: FX "lineTo", mx, my+ms*1.5: FX "lineTo", mx-ms, my+ms: FX "endFill": FX "beginFill", c3, 100: FX "moveTo", mx, my+ms/2: FX "lineTo", mx+ms, my: FX "lineTo", mx+ms, my+ms: FX "lineTo", mx, my+ms*1.5: FX "endFill"
2740 GO TO 2442
2800 REM ---- a giant ant: shadow, six legs that scurry, then abdomen, thorax and head along its heading, the far end first ----
2805 LET sx=ox+(ex(e)-ey(e))*hw: LET sy=oy+(ex(e)+ey(e))*hh
2810 LET hx=(eu(e)-ev(e))*hw: LET hy=(eu(e)+ev(e))*hh: LET d=SQR (hx*hx+hy*hy): IF d<0.001 THEN LET hx=1: LET hy=0.5: LET d=1.118
2815 LET nx=hx/d: LET ny=hy/d: LET lx=-ny: LET ly=nx*0.5
2820 FX "lineStyle": FX "beginFill", 0, 35: LET ecx=sx: LET ecy=sy: LET erx=9: LET ery=3.5: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill"
2825 FX "lineStyle", 1.5, #1a0c08, 100: FOR q=-1 TO 1: LET lw=1.5*SIN (ea(e)*0.9+q*2): FX "moveTo", sx+nx*q*3, sy-5+ny*q*3: FX "lineTo", sx+nx*(q*4+lw)+lx*8, sy-1+ny*(q*4+lw)+ly*8: FX "moveTo", sx+nx*q*3, sy-5+ny*q*3: FX "lineTo", sx+nx*(q*4-lw)-lx*8, sy-1+ny*(q*4-lw)-ly*8: NEXT q
2830 FX "lineStyle", 1, 0, 100: FOR pt=1 TO 3: LET w=pt: IF ny<0 THEN LET w=4-pt
2832 IF w=1 THEN LET ecx=sx-nx*7: LET ecy=sy-5-ny*7: LET erx=5.5: LET ery=4: LET c=#7a2a14
2834 IF w=2 THEN LET ecx=sx: LET ecy=sy-6: LET erx=3: LET ery=2.5: LET c=#5a1e0e
2836 IF w=3 THEN LET ecx=sx+nx*6.5: LET ecy=sy-7+ny*6.5: LET erx=3.5: LET ery=3: LET c=#7a2a14
2838 FX "beginFill", c, 100: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill": NEXT pt
2840 FX "lineStyle", 1, #1a0c08, 100: LET hx=sx+nx*6.5: LET hy=sy-7+ny*6.5: FX "moveTo", hx, hy-2: FX "lineTo", hx+nx*4+lx*3, hy-7: FX "moveTo", hx, hy-2: FX "lineTo", hx+nx*4-lx*3, hy-7: FX "lineStyle", 1, 0, 100: GO TO 2442
2900 REM ---- a wraith: a pale shape with a ragged hem, nearly invisible by day ----
2905 LET sx=ox+(ex(e)-ey(e))*hw: LET sy=oy+(ex(e)+ey(e))*hh: LET gy0=sy: LET sy=sy-ez(e)*bh: LET al=25: IF lt<0.75 THEN LET al=80
2910 FX "lineStyle": FX "beginFill", 0, al*0.4: LET ecx=sx: LET ecy=gy0: LET erx=6: LET ery=2.5: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill"
2915 LET w=1.5*SIN (ea(e)/3): FX "lineStyle", 1, #8090c0, al: FX "beginFill", #dfe8ff, al: FX "moveTo", sx-6, sy-2: FX "lineTo", sx-6, sy-13: FX "curveTo", sx-6, sy-21, sx, sy-21: FX "curveTo", sx+6, sy-21, sx+6, sy-13: FX "lineTo", sx+6, sy-2
2920 FX "lineTo", sx+4, sy+1+w: FX "lineTo", sx+2, sy-2: FX "lineTo", sx, sy+1-w: FX "lineTo", sx-2, sy-2: FX "lineTo", sx-4, sy+1+w: FX "lineTo", sx-6, sy-2: FX "endFill"
2925 FX "lineStyle", 2.5, #101030, al: FX "moveTo", sx-2.2, sy-15.5: FX "lineTo", sx-2.2, sy-12.5: FX "moveTo", sx+2.2, sy-15.5: FX "lineTo", sx+2.2, sy-12.5
2930 FX "lineStyle", 1, 0, 100: GO TO 2442
3000 REM ---- hallow hk at (sx,sy) in a glow: the Stone of Fal, the Spear of Lugh, the Sword of Nuada, the Cauldron of the Dagda ----
3005 FX "lineStyle": FX "beginFill", #ffe060, 22: LET ecx=sx: LET ecy=sy-11: LET erx=10: LET ery=10: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill": FX "lineStyle", 1, 0, 100
3010 IF hk=1 THEN LET mx=sx: LET my=sy-10: LET ms=6: LET c1=#d0d0d8: LET c2=#9898a8: LET c3=#6a6a7a: FX "beginFill", c1, 100: FX "moveTo", mx, my-ms/2: FX "lineTo", mx+ms, my: FX "lineTo", mx, my+ms/2: FX "lineTo", mx-ms, my: FX "endFill": FX "beginFill", c2, 100: FX "moveTo", mx-ms, my: FX "lineTo", mx, my+ms/2: FX "lineTo", mx, my+ms*1.5: FX "lineTo", mx-ms, my+ms: FX "endFill": FX "beginFill", c3, 100: FX "moveTo", mx, my+ms/2: FX "lineTo", mx+ms, my: FX "lineTo", mx+ms, my+ms: FX "lineTo", mx, my+ms*1.5: FX "endFill": GO TO 2442
3015 IF hk=2 THEN FX "lineStyle", 2, #8a5a2a, 100: FX "moveTo", sx-6, sy-1: FX "lineTo", sx+5, sy-18: FX "lineStyle", 1, 0, 100: FX "beginFill", #f0c040, 100: FX "moveTo", sx+3, sy-17: FX "lineTo", sx+9, sy-26: FX "lineTo", sx+7, sy-15: FX "lineTo", sx+3, sy-17: FX "endFill": GO TO 2442
3020 IF hk=4 THEN GO TO 3040
3025 FX "beginFill", #e8eef8, 100: FX "moveTo", sx-1.3, sy-7: FX "lineTo", sx+1.3, sy-7: FX "lineTo", sx+1.3, sy-22: FX "lineTo", sx, sy-25: FX "lineTo", sx-1.3, sy-22: FX "lineTo", sx-1.3, sy-7: FX "endFill"
3030 FX "beginFill", #f0c040, 100: FX "moveTo", sx-5, sy-8.5: FX "lineTo", sx+5, sy-8.5: FX "lineTo", sx+5, sy-6.5: FX "lineTo", sx-5, sy-6.5: FX "lineTo", sx-5, sy-8.5: FX "endFill"
3035 FX "lineStyle", 2, #6a3a1a, 100: FX "moveTo", sx, sy-6.5: FX "lineTo", sx, sy-2.5: FX "lineStyle", 1, 0, 100: FX "beginFill", #f0c040, 100: LET ecx=sx: LET ecy=sy-1.8: LET erx=1.6: LET ery=1.6: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill": GO TO 2442
3040 FX "beginFill", #262626, 100: FX "moveTo", sx-7, sy-12: FX "curveTo", sx-8, sy-1, sx, sy-1: FX "curveTo", sx+8, sy-1, sx+7, sy-12: FX "lineTo", sx-7, sy-12: FX "endFill"
3045 FX "beginFill", #f0c040, 100: LET ecx=sx: LET ecy=sy-12: LET erx=7.5: LET ery=2.5: FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: FX "endFill": GO TO 2442
3100 REM ---- a healing herb: three leaves and a red berry ----
3105 FX "beginFill", #3cb850, 100: FX "moveTo", sx, sy-3: FX "lineTo", sx-6, sy-5: FX "lineTo", sx-1, sy-6: FX "lineTo", sx, sy-3: FX "lineTo", sx+6, sy-6: FX "lineTo", sx+1, sy-7: FX "lineTo", sx, sy-3: FX "lineTo", sx-1.5, sy-9: FX "lineTo", sx, sy-12: FX "lineTo", sx+1.5, sy-9: FX "lineTo", sx, sy-3: FX "endFill"
3110 FX "lineStyle", 3, #e03030, 100: FX "moveTo", sx+2, sy-11: FX "lineTo", sx+2.5, sy-11.5: FX "lineStyle", 1, 0, 100: GO TO 2442
3300 REM ======================== the panel: printed words and blocks, and sprites, changed only when something changes ========================
3305 PRINT AT 19,0; INK 5; rn$(rm): PRINT AT 20,0; INK 7; "ENERGY": PRINT AT 21,0; INK 7; "DAY "; day; " OF 20  "
3310 FOR k=1 TO 4: PRINT AT 21,19+2*(k-1); INK 1; "?": NEXT k
3315 LET dshown=day: LET wn=-1: GO SUB 3320: GO SUB 3340: RETURN
3320 REM ---- energy: ten blocks, red when low ----
3322 LET eb=INT (en/10+0.5): LET t$="": FOR k=1 TO 10: LET c$=" ": IF k<=eb THEN LET c$=CHR$ 143
3324 LET t$=t$+c$: NEXT k: LET n=4: IF eb<=3 THEN LET n=2
3326 PRINT AT 20,7; INK n; t$: RETURN
3340 REM ---- the window: blue sky by day, dark by night, the sun or moon on its arc; and the hallows found ----
3342 LET nn=0: IF ph>=0.6 THEN LET nn=1
3344 IF nn<>wn THEN LET wn=nn: LET n=1-nn: FOR k=19 TO 20: PRINT AT k,27; PAPER n; "     ": NEXT k: PRINT AT 21,27; PAPER 4; "     "
3346 SPRITE CLEAR: LET an=PI*ph/0.6: IF nn THEN LET an=PI*(ph-0.6)/0.4
3348 LET x=236-14*COS an: LET y=166-10*SIN an: IF nn THEN SPRITE "moon", x, y
3350 IF NOT nn THEN SPRITE "sun", x, y
3352 FOR k=1 TO 4: IF got(k) THEN SPRITE "hal"+STR$ k, 151+16*(k-1), 160, 130
3354 NEXT k: RETURN
3500 REM ---- the message line: msg$ while msgt counts down ----
3505 PRINT AT 18,0; "                                ": IF msgt>0 THEN PRINT AT 18,INT ((32-LEN msg$)/2); INK 6; msg$
3510 RETURN
3550 REM ---- t$ centred on row r in ink n ----
3555 PRINT AT r,0; "                                ": PRINT AT r,INT ((32-LEN t$)/2); INK n; t$: RETURN
4000 REM ======================== the island: nine rooms, their ants and wraiths, the hallows and herbs ========================
4002 REM in a room's rows: . floor, 1-5 a stack of stone, c a crate, g the golden altar, ~ water, ^ spikes
4005 RESTORE 9000: FOR r=1 TO 9: READ rn$(r), rs(r,1), rs(r,2), rs(r,3), rf(r,1), rf(r,2), rf(r,3), rw(r,1), rw(r,2), rw(r,3)
4010 FOR j=1 TO 8: READ m$: FOR i=1 TO 8: LET ch$=m$(i): LET h=0: LET f=0
4015 FOR k=1 TO 7: LET bt(r,i,j,k)=0: NEXT k
4020 IF ch$>="1" AND ch$<="5" THEN LET h=VAL ch$: FOR k=1 TO h: LET bt(r,i,j,k)=1: NEXT k
4025 IF ch$="c" THEN LET h=1: LET bt(r,i,j,1)=2
4030 IF ch$="g" THEN LET h=1: LET bt(r,i,j,1)=3
4035 IF ch$="~" THEN LET f=2
4040 IF ch$="^" THEN LET f=1
4045 LET ht(r,i,j)=h: LET fl(r,i,j)=f: NEXT i: NEXT j: NEXT r
4050 REM ants (kind 1) wander; wraiths (kind 2) float along x (1) or y (2)
4055 RESTORE 9400: READ ne: FOR e=1 TO ne: READ er(e), ek(e), ex(e), ey(e), ax: LET ez(e)=0: LET ea(e)=INT (RND*50): LET ec(e)=0: LET eu(e)=0: LET ev(e)=0
4060 IF ax=0 THEN LET eu(e)=0.05
4062 IF ax=1 THEN LET eu(e)=0.045
4064 IF ax=2 THEN LET ev(e)=0.045
4066 NEXT e
4070 REM the four hallows (kinds 1-4) and the herbs (kind 5), each on top of whatever is in its cell
4075 RESTORE 9450: READ ni: FOR i=1 TO ni: READ ik(i), ir(i), ci, cj: LET ix(i)=ci-0.5: LET iy(i)=cj-0.5: LET iz(i)=ht(ir(i),ci,cj): LET ig(i)=0: NEXT i
4080 FOR k=1 TO 4: LET got(k)=0: NEXT k: RETURN
4500 REM ======================== the room as faces, back to front ========================
4502 REM first the floor and its front edges (and a path out through each front doorway), drawn before the grid
4505 LET nq=0: LET sk=-3
4510 LET cc=15: LET a1=0: LET b1=0: LET a2=8: LET b2=8: LET zz=0: GO SUB 4680
4515 LET cc=16: LET g=8: LET a1=0: LET a2=8: LET z1=-0.4: LET z2=0: GO SUB 4685
4520 LET cc=17: LET g=8: LET a1=0: LET a2=8: LET z1=-0.4: LET z2=0: GO SUB 4690
4525 IF rrow<2 THEN LET cc=15: LET a1=3: LET b1=8: LET a2=5: LET b2=8.8: LET zz=0: GO SUB 4680
4530 IF rcol<2 THEN LET cc=15: LET a1=8: LET b1=3: LET a2=8.8: LET b2=5: LET zz=0: GO SUB 4680
4535 LET nfl=nq: LET sk=-2: LET wh=3
4540 REM the two back walls, with a doorway wherever there is a room beyond
4545 LET cc=13: LET g=0: LET z1=0: LET z2=wh: IF rrow=0 THEN LET a1=0: LET a2=8: GO SUB 4685
4550 IF rrow>0 THEN LET a1=0: LET a2=3: GO SUB 4685: LET a1=5: LET a2=8: GO SUB 4685: LET a1=3: LET a2=5: LET z1=2.2: GO SUB 4685: LET cc=14: LET g=3: LET a1=-0.3: LET a2=0: LET z1=0: LET z2=2.2: GO SUB 4690
4555 LET cc=14: LET g=0: LET z1=0: LET z2=wh: IF rcol=0 THEN LET a1=0: LET a2=8: GO SUB 4690
4560 IF rcol>0 THEN LET a1=0: LET a2=3: GO SUB 4690: LET a1=5: LET a2=8: GO SUB 4690: LET a1=3: LET a2=5: LET z1=2.2: GO SUB 4690: LET cc=13: LET g=3: LET a1=-0.3: LET a2=0: LET z1=0: LET z2=2.2: GO SUB 4685
4565 LET cc=13: LET g=8: LET a1=-0.3: LET a2=0: LET z1=0: LET z2=wh: GO SUB 4685: LET cc=14: GO SUB 4690
4568 LET cc=12: LET zz=wh: LET a1=0: LET b1=-0.3: LET a2=8: LET b2=0: GO SUB 4680: LET a1=-0.3: LET b1=-0.3: LET a2=0: LET b2=8: GO SUB 4680
4570 REM water lies a little below the floor
4572 LET sk=-1: FOR j=1 TO 8: FOR i=1 TO 8: IF fl(rm,i,j)=2 THEN LET cc=18: LET a1=i-1: LET b1=j-1: LET a2=i: LET b2=j: LET zz=-0.1: GO SUB 4680
4575 NEXT i: NEXT j
4578 REM then every column of blocks, a diagonal at a time from the back corner, each bottom to top; only faces that can be seen
4580 FOR s=0 TO 14: FOR i=0 TO 7: LET j=s-i: IF j<0 OR j>7 THEN GO TO 4620
4585 LET sk=s: IF fl(rm,i+1,j+1)=1 THEN GO SUB 4650
4590 LET h=ht(rm,i+1,j+1): IF h=0 THEN GO TO 4620
4595 FOR k=1 TO h: LET t=bt(rm,i+1,j+1,k)
4600 IF k=h THEN LET cc=t*3: LET a1=i: LET b1=j: LET a2=i+1: LET b2=j+1: LET zz=k: GO SUB 4680
4605 IF j=7 OR ht(rm,i+1,j+2)<k THEN LET cc=t*3+1: LET g=j+1: LET a1=i: LET a2=i+1: LET z1=k-1: LET z2=k: GO SUB 4685
4610 IF i=7 OR ht(rm,i+2,j+1)<k THEN LET cc=t*3+2: LET g=i+1: LET a1=j: LET a2=j+1: LET z1=k-1: LET z2=k: GO SUB 4690
4615 NEXT k
4620 NEXT i: NEXT s: RETURN
4650 REM a bed of spikes: a dark square and four little pyramids, seen as triangles
4652 LET cc=23: LET a1=i: LET b1=j: LET a2=i+1: LET b2=j+1: LET zz=0: GO SUB 4680: LET cc=21
4655 FOR q=0 TO 3: LET gx0=i+0.3+0.4*(q-2*INT (q/2)): LET gy0=j+0.3+0.4*INT (q/2)
4660 LET u1=gx0-0.14: LET v1=gy0+0.14: LET w1=0: LET u2=gx0+0.14: LET v2=gy0-0.14: LET w2=0: LET u3=gx0: LET v3=gy0: LET w3=0.55: LET u4=u3: LET v4=v3: LET w4=w3: GO SUB 4700: NEXT q: RETURN
4680 REM a flat rectangle at height zz, from (a1,b1) to (a2,b2)
4682 LET u1=a1: LET v1=b1: LET u2=a2: LET v2=b1: LET u3=a2: LET v3=b2: LET u4=a1: LET v4=b2: LET w1=zz: LET w2=zz: LET w3=zz: LET w4=zz: GO TO 4700
4685 REM an upright rectangle facing down and left, at y=g, from x=a1 to a2 and height z1 to z2
4687 LET u1=a1: LET u2=a2: LET u3=a2: LET u4=a1: LET v1=g: LET v2=g: LET v3=g: LET v4=g: LET w1=z2: LET w2=z2: LET w3=z1: LET w4=z1: GO TO 4700
4690 REM an upright rectangle facing down and right, at x=g, from y=a1 to a2 and height z1 to z2
4692 LET v1=a1: LET v2=a2: LET v3=a2: LET v4=a1: LET u1=g: LET u2=g: LET u3=g: LET u4=g: LET w1=z2: LET w2=z2: LET w3=z1: LET w4=z1: GO TO 4700
4700 REM keep the face, already turned into screen pixels, with its colour cc and its place sk in the drawing order
4705 LET nq=nq+1: LET qc(nq)=cc: LET qs(nq)=sk
4710 LET qx(nq,1)=ox+(u1-v1)*hw: LET qy(nq,1)=oy+(u1+v1)*hh-w1*bh: LET qx(nq,2)=ox+(u2-v2)*hw: LET qy(nq,2)=oy+(u2+v2)*hh-w2*bh
4715 LET qx(nq,3)=ox+(u3-v3)*hw: LET qy(nq,3)=oy+(u3+v3)*hh-w3*bh: LET qx(nq,4)=ox+(u4-v4)*hw: LET qy(nq,4)=oy+(u4+v4)*hh-w4*bh: RETURN
5300 REM ======================== title: the shrine, with the hallows circling its altar ========================
5305 CLS: BORDER 0: SPRITE CLEAR: GO SUB 4000: LET titlemode=1: LET rm=9: LET rrow=2: LET rcol=2: LET lt=1: LET ph=0.3: GO SUB 1250: GO SUB 4500
5310 LET ft=0: LET pg=-1: LET px=-50: LET py=-50: LET pz=0
5315 FOR k=1 TO 4: LET an=ft/40+k*PI/2: LET ir(k)=9: LET ig(k)=0: LET ix(k)=4+1.7*COS an: LET iy(k)=4+1.7*SIN an: LET iz(k)=1.4+0.3*SIN (ft/9+k): NEXT k
5320 GO TO 2400
5330 IF INT (ft/110)<>pg THEN LET pg=INT (ft/110): GO SUB 5360
5332 IF KEY "l" THEN LOADER
5335 IF KEY " " OR KEY CHR$ 13 THEN GO TO 5350
5340 LET ft=ft+1: PAUSE 1: GO TO 5315
5350 REPEAT: PAUSE 1: UNTIL NOT (KEY " " OR KEY CHR$ 13)
5355 GO TO 1300
5360 LET w=pg-3*INT (pg/3)
5362 IF w=0 THEN LET a$="THE FOUR HALLOWS": LET b$="OISIN IS HOME FROM TIR NA NOG.": LET c$="BRING THE FOUR HALLOWS TO THE": LET d$="ALTAR BEFORE TWENTY DAYS PASS."
5364 IF w=1 THEN LET a$="ARROWS OR Q A O P TO WALK": LET b$="SPACE OR M TO JUMP": LET c$="T OR ENTER TAKES AND DROPS": LET d$="PRESS SPACE TO BEGIN"
5366 IF w=2 THEN LET a$="ANTS HOLD THE STONE CITY.": LET b$="THE SIDHE WALK BY NIGHT.": LET c$="HERBS HEAL. CRATES STACK.": LET d$="PRESS SPACE TO BEGIN"
5368 LET r=18: LET t$=a$: LET n=6: GO SUB 3550: LET r=19: LET t$=b$: LET n=7: GO SUB 3550: LET r=20: LET t$=c$: GO SUB 3550: LET r=21: LET t$=d$: LET n=4: GO SUB 3550: RETURN
9000 REM ---- the rooms, three by three: name, stone, floor and wall colours, then eight rows from the back ----
9010 DATA "THE GREY SHORE",150,150,165,92,104,96,118,122,134
9011 DATA "~~~~~~~~","~~~~~~..","~~~~....","~~~.....","~~..1...","~...12..","~.......","~~~..~~~"
9020 DATA "THE STANDING STONES",170,170,150,80,110,70,110,120,100
9021 DATA "........","..3..3..",".3....3.","....2...","........",".3....3.","..3..3.c","........"
9030 DATA "THE ANT HILLS",150,110,70,120,90,60,100,80,60
9031 DATA "........",".11..11.",".1....1.","...11...","...11...",".1....1.",".11..11.","........"
9040 DATA "THE DROWNED CHAPEL",120,130,150,90,90,110,100,105,130
9041 DATA "~~~..~~~","~......~","~.~~~~.~","~.1~1~..","~.~~~~..","~.~~2~.~","~......~","~~~..~~~"
9050 DATA "THE KING'S HALL",180,160,120,120,100,80,150,120,90
9051 DATA "........",".2....2.","........","........","........",".2....2.","c......c","........"
9060 DATA "THE CITY OF STONE",160,160,160,110,110,110,130,130,130
9061 DATA "........",".123....",".1.3.22.","...3.2..",".....2..",".11.....",".1..333.","........"
9070 DATA "THE CRYPT",110,100,120,60,55,70,80,70,95
9071 DATA "333..^..","33....^.","........","..^..^..","........",".^....^.","......c.","........"
9080 DATA "THE CRATE YARD",140,120,90,100,90,70,120,100,80
9081 DATA "........",".c....c.","..1111..","..1221..","..1221..","..1111..",".c....c.","........"
9090 DATA "THE SHRINE",200,200,220,90,80,120,140,130,170
9091 DATA "........",".1....4.","........","...gg...","...gg...","........",".4....1.","........"
9400 REM ants and wraiths: room, kind, x, y, which way a wraith floats
9410 DATA 10
9411 DATA 1,1,5.5,3.5,0, 3,1,2.5,4.5,0, 3,1,6.5,3.5,0, 6,1,1.5,4.5,0, 6,1,6.5,5.5,0
9412 DATA 6,1,4.5,7.5,0, 4,2,4.5,1.5,1, 7,2,4.5,4.5,1, 9,2,1.5,3.5,2, 9,2,6.5,3.5,2
9450 REM hallows and herbs: kind, room, column, row
9460 DATA 8
9461 DATA 1,2,5,4, 2,6,4,4, 3,4,5,6, 4,7,1,1, 5,1,7,6, 5,3,4,4, 5,5,5,2, 5,8,4,4
9500 DATA "THE STONE OF FAL","THE SPEAR OF LUGH","THE SWORD OF NUADA","THE CAULDRON OF THE DAGDA"
