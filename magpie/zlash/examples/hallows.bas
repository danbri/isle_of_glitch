5 REM touch: up down left right space=JUMP t=TAKE l=LOADER
10 REM ======================== THE FOUR HALLOWS: an isometric quest ========================
20 REM Oisin is home from Tir na nOg, and the Four Hallows of the Tuatha De Danann lie scattered
30 REM over a little island of nine rooms. Bring all four to the golden altar in the shrine before
40 REM twenty days pass. In the manner of 1980s isometric games: flick-screen rooms drawn block by
50 REM block (Ultimate's Knight Lore), giant ants in a city of stone you can jump clear of (Ant Attack),
60 REM crates you pick up, carry from room to room and stack to climb on (Fairlight, Knight Lore), a sun
70 REM and moon keeping the days, and a Celtic quest with healing herbs and the sidhe abroad by night
80 REM (Tir Na Nog). The room is drawn with FX each frame, back to front, so blocks hide what is behind.
81 REM
82 REM Light: each block casts a shadow to the right and darkens the floor at its foot, tops catch a bevel of
83 REM light, water shimmers, and at night three veils of dark leave a soft pool of lamplight round Oisin.
84 REM Motion, after the twelve principles of animation: Oisin eases into a walk and out of it, crouches before
85 REM he jumps (anticipation), stretches as he rises and squashes as he lands, his hem and hair trail and swing
86 REM on (follow-through), his feet lift in arcs, he breathes and blinks when he stands (secondary action), and
87 REM throws up his arms at a find. Every figure is DATA: polygons, ellipses and strokes whose points belong
88 REM to a rig (feet, head, hem, hair, hands) that each figure moves every frame. Dust, drops, sparkles,
89 REM stars and fireflies are particles.
90 REM Speed: a GO SUB costs more than drawing a dozen faces, so the frame is one path of GO TOs, the standing
91 REM test and the face drawer say where to go back to (rt, rq, re, bk), and the lines run every frame come first
92 REM (600-1248, then 2400-3160), so the compiler's split of this long program falls between game and drawing.
93 REM
94 REM    100 setup   600 the loop   700 Oisin   800 standing room   900 ants and wraiths   1000 what he touches
95 REM   1100 crates   1200 particles and the days   1250 colours   1300 a new game   1400 into a room   1500 the end
96 REM   2400 a frame   2600 particles and light   2700 figures   3000 a shape   3300 the panel   4000 the island
97 REM   4500 the room as faces   5300 title   9000 the rooms   9600 the figures      arrows or Q A O P walk,
98 REM   SPACE or M jumps, T or ENTER takes and drops, L back to the loader
100 REM ======================== setup ========================
110 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
115 REM the isometric view: a cell is 24 pixels across and 12 down; a block is 12 pixels tall
120 LET hw=12: LET hh=6: LET bh=12: LET ox=128: LET oy=40: LET dl=1250: LET rr=0.28
125 REM the island: heights, the block at each level, floors (1 spikes, 2 water), and each room's colours
130 DIM ht(9,9,9): DIM bt(9,9,9,7): DIM fl(9,9,9): DIM rs(9,3): DIM rf(9,3): DIM rw(9,3): DIM rn$(9,24)
135 REM the room as a list of faces of up to six corners in drawing order, each a fill, a shadow or a line of light
140 DIM qx(900,6): DIM qy(900,6): DIM qn(900): DIM qt(900): DIM qa(900): DIM qc(900): DIM qs(900): DIM pal(40): DIM wcx(64): DIM wcy(64): DIM qbl(900): DIM qbr(900): DIM qbt(900): DIM qbb(900): DIM vh(9,9): DIM vf(9,9): DIM vt(9,9,7)
145 REM ants and wraiths; hallows and herbs; and the figures sorted for drawing
150 DIM ek(12): DIM er(12): DIM ex(12): DIM ey(12): DIM ez(12): DIM eu(12): DIM ev(12): DIM ea(12): DIM ec(12): DIM wf(12)
155 DIM ik(10): DIM ir(10): DIM ix(10): DIM iy(10): DIM iz(10): DIM ig(10): DIM got(4): DIM hn$(4,25)
160 DIM ok(24): DIM oc(24)
162 REM particles: position, velocity, life left, life at birth, kind (1 dust, 2 drop, 3 star, 4 sparkle, 5 firefly)
164 DIM zk(13): DIM zs(13): DIM zw(13): DIM zl(13): DIM kx(30): DIM ky(30): DIM kz(30): DIM ku(30): DIM kv(30): DIM kw(30): DIM kl(30): DIM km(30): DIM kk(30)
165 REM an ellipse is eight curves; their control and end points round a unit circle
170 DIM ux(8): DIM uy(8): DIM vx(8): DIM vy(8)
184 DIM pk(120): DIM pf(120): DIM po(120): DIM pc(120): DIM pa(120): DIM pw(120): DIM pe(120): DIM pn(120): DIM ps(120)
186 DIM gxv(500): DIM gyv(500): DIM grv(500): DIM sf(10): DIM sl(10): DIM rdx(9): DIM rdy(9)
192 REM the panel's pictures: the sun and moon, and the hallows as you find them
193 EMOJI "☀️","sun",14: EMOJI "🌙","moon",14
194 SPRITE "hal1","...hhhh...","..hhhhh7..","..hhhh777.","..hhh7777.","..hhh7777.","..hh77777.","..hh77777.","..h777777.",".hh777777.","4444444444"
195 SPRITE "hal2",".........g","........gg",".......gg.","......2g..",".....2....","....2.....","...2......","..2.......",".2........","2........."
196 SPRITE "hal3","....h.....","...hh7....","...hh7....","...hh7....","...hh7....","...hh7....",".gggggg...","....2.....","....2.....","...ggg...."
197 SPRITE "hal4","..........","..........","6666666666",".77777777.","7777777777","7777777777",".77777777.","..777777..",".7......7.",".........."
199 GO SUB 5250: GO TO 5300
610 IF en<=0 THEN GO TO 5100: REM the loop, 25 times a second: 700 Oisin, 900 the others, 1000 what he touches, 1200 particles and the day, 2400 the frame, and back here
615 IF day>20 THEN GO TO 5150
620 IF won THEN GO TO 5200
625 IF KEY "l" THEN LOADER
630 PAUSE 1
700 REM ======================== Oisin: walk the way the arrows point on the screen, jump, take ========================
705 LET tdx=0: LET tdy=0: LET opx=px: LET opy=py
710 IF KEY CHR$ 11 OR KEY "q" THEN LET tdx=tdx-1: LET tdy=tdy-1
715 IF KEY CHR$ 10 OR KEY "a" THEN LET tdx=tdx+1: LET tdy=tdy+1
720 IF KEY CHR$ 8 OR KEY "o" THEN LET tdx=tdx-1: LET tdy=tdy+1
725 IF KEY CHR$ 9 OR KEY "p" THEN LET tdx=tdx+1: LET tdy=tdy-1
726 IF KEY "z" OR KEY "x" THEN IF rkh=0 AND rta=0 THEN LET rkh=1: LET rta=12: LET rdir=1: IF KEY "z" THEN LET rdir=-1
727 IF NOT (KEY "z" OR KEY "x") THEN LET rkh=0: REM Z and X turn the view a quarter, as in Ant Attack
730 IF tdx<>0 OR tdy<>0 THEN LET d=SQR (tdx*tdx+tdy*tdy): LET tdx=tdx/d*0.11: LET tdy=tdy/d*0.11: LET q=tdx: LET tdx=m11*q+m21*tdy: LET tdy=m12*q+m22*tdy
734 LET pvx=pvx+(tdx-pvx)*0.3: LET pvy=pvy+(tdy-pvy)*0.3: IF ABS pvx<0.002 AND tdx=0 THEN LET pvx=0: REM slow in and slow out: he eases up to speed and eases to a stop; a knock sends him sliding
735 IF ABS pvy<0.002 AND tdy=0 THEN LET pvy=0
736 LET spd=SQR (pvx*pvx+pvy*pvy): LET mv=spd/0.11: IF mv>1 THEN LET mv=1
738 IF tdx=0 AND tdy=0 THEN GO TO 746
740 IF ABS tdx>=ABS tdy THEN LET facex=SGN tdx: LET facey=0
742 IF ABS tdx<ABS tdy THEN LET facex=0: LET facey=SGN tdy
746 LET wph=wph+spd*2.6: IF spd=0 THEN GO TO 760
750 LET tx=px+pvx: LET ty=py: LET rt=1: GO TO 800: REM one axis at a time, so he slides along walls; he can step down anywhere but must jump up
751 IF bad=0 AND gh<=pz+0.05 AND NOT (wet=1 AND gh=0 AND pz<0.3) THEN LET px=tx
755 LET tx=px: LET ty=py+pvy: LET rt=2: GO TO 800
756 IF bad=0 AND gh<=pz+0.05 AND NOT (wet=1 AND gh=0 AND pz<0.3) THEN LET py=ty
760 REM falling and landing
765 LET tx=px: LET ty=py: LET rt=3: GO TO 800
770 IF pz<=gh+0.001 THEN GO TO 776
771 LET vz=vz-0.07: LET pz=pz+vz: IF pz>gh THEN GO TO 778
772 LET pz=gh: LET imp=-vz: LET vz=0: IF wet=1 AND gh=0 THEN GO TO 794
774 LET vsq=vsq-0.5*imp: LET kp=1: LET cnt=2+INT (imp*10): LET gx=px: LET gy=py: LET gz=pz: GO SUB 1095.5: TONE -14
775 GO TO 778
776 IF pz<gh THEN LET pz=gh: LET vz=0
778 IF jant>0 THEN LET jant=jant-1: IF jant=0 THEN LET vz=0.42: LET pz=pz+vz: LET vsq=vsq+0.12: TONE -2: LET kp=2: LET cnt=2: LET gx=px: LET gy=py: LET gz=pz: GO SUB 1095.5: REM anticipation: a crouch of three frames, then the leap
779 IF jant=0 AND pz=gh AND vz=0 AND (KEY " " OR KEY "m") THEN LET jant=3
780 IF im=4 THEN LET st=1+0.1*SIN (PI*imt/60): REM a stretch lifts him a little
781 LET st=1: IF jant>0 THEN LET st=0.78: REM squash and stretch: a spring pulls his height back to the pose he is in; crouched, rising, falling, standing
782 IF pz>gh+0.01 THEN LET st=1.04: IF vz>0 THEN LET st=1.13
783 LET vsq=(vsq+(st-sq)*0.3)*0.7: LET sq=sq+vsq: IF sq<0.6 THEN LET sq=0.6
784 LET vvx=m11*pvx+m12*pvy: LET vvy=m21*pvx+m22*pvy: LET sxv=vvx-vvy: LET syv=vvx+vvy: REM his motion as the camera sees it, across and down the screen
785 LET q=-sxv*hw*2.4: LET hmv=(hmv+(q-hemx)*0.25)*0.72: LET hemx=hemx+hmv: LET hrv=(hrv+(-vz*6-hairy)*0.3)*0.7: LET hairy=hairy+hrv: REM follow-through: the hem and the hair trail behind him and swing on past when he stops
786 IF blk>0 THEN LET blk=blk-1
787 IF blk=0 AND RND<0.012 THEN LET blk=5
788 IF pose>0 THEN LET pose=pose-1
789 IF pz=gh AND spd>0.06 THEN LET dst=dst+spd: IF dst>0.7 THEN LET dst=0: LET kp=3: LET cnt=1: LET gx=px-pvx*3: LET gy=py-pvy*3: LET gz=pz: GO SUB 1095.5
791 IF KEY "t" OR KEY CHR$ 13 THEN IF tkheld=0 THEN LET tkheld=1: GO SUB 3600
792 IF NOT (KEY "t" OR KEY CHR$ 13) THEN LET tkheld=0
793 GO TO 1100
794 REM into the water: a splash, then back to the doorway, colder and weaker
795 LET en=en-10: LET kp=4: LET cnt=12: LET gx=px: LET gy=py: LET gz=0: GO SUB 1095.5: LET px=entx: LET py=enty: LET pz=0: LET vz=0: LET pvx=0: LET pvy=0: LET msg$="SPLASH!": LET msgt=40: GO SUB 3500: TONE -15
796 IF px<0 THEN LET rm=rm-1: LET px=7.7: GO SUB 3850: GO TO 900
797 IF px>=8 THEN LET rm=rm+1: LET px=0.3: GO SUB 3850: GO TO 900
798 IF py<0 THEN LET rm=rm-3: LET py=7.7: GO SUB 3850: GO TO 900
799 IF py>=8 THEN LET rm=rm+3: LET py=0.3: GO SUB 3850
800 REM ======================== standing room: the highest ground under a footprint of radius rr at (tx,ty) ========================
803 IF rt=0 THEN GO TO 900: REM (the line before falls through to 900 by way of rt=0); bad=1 if a corner is off the floor other than through a doorway; wet=1 if a corner is over water; then back to rt
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
835 IF rt=1 THEN LET rt=0: GO TO 751
837 IF rt=2 THEN LET rt=0: GO TO 756
839 LET rt=0: GO TO 770
900 REM ======================== ants and wraiths ========================
905 LET e=0: LET nd=99: LET nk=0
906 LET e=e+1: IF e>ne THEN GO TO 1000
908 IF er(e)<>rm THEN GO TO 906
910 LET ea(e)=ea(e)+1: IF ek(e)=2 THEN GO TO 950
920 LET ddx=px-ex(e): LET ddy=py-ey(e): LET d=SQR (ddx*ddx+ddy*ddy)+0.001: LET sp=0.07: IF lt<0.75 THEN LET sp=0.09: REM an ant smells Oisin when he is near and on the ground, and comes; after a bite it backs off. It cannot climb
921 IF d<nd THEN LET nd=d: LET nlx=ex(e): LET nly=ey(e): LET nk=1
924 IF ec(e)>0 THEN LET ec(e)=ec(e)-1: LET eu(e)=-ddx/d*sp: LET ev(e)=-ddy/d*sp: GO TO 930
925 IF d<4.5 AND pz<0.9 THEN LET eu(e)=ddx/d*sp: LET ev(e)=ddy/d*sp
928 IF NOT (d<4.5 AND pz<0.9) AND RND<0.04 THEN LET an=RND*2*PI: LET eu(e)=COS an*sp*0.7: LET ev(e)=SIN an*sp*0.7
930 LET tx=ex(e)+eu(e): LET ty=ey(e): LET rt=4: GO TO 992
931 IF cango THEN LET ex(e)=tx
932 IF NOT cango THEN LET eu(e)=-eu(e)
933 LET tx=ex(e): LET ty=ey(e)+ev(e): LET rt=5: GO TO 992
934 IF cango THEN LET ey(e)=ty
935 IF NOT cango THEN LET ev(e)=-ev(e)
936 IF d<0.6 AND pz<0.6 AND ec(e)=0 THEN LET en=en-6: LET hurt=6: LET ec(e)=30: LET pvx=ddx/d*0.22: LET pvy=ddy/d*0.22: LET vsq=vsq-0.15: LET kp=5: LET cnt=4: LET gx=px: LET gy=py: LET gz=pz+1.6: GO SUB 1095.5
937 IF RND<0.03 THEN LET kp=6: LET cnt=1: LET gx=ex(e): LET gy=ey(e): LET gz=0: GO SUB 1095.5
940 GO TO 906
950 REM a wraith of the sidhe floats up and down its line; by day it fades to a faint harmless shape
955 LET tx=ex(e)+eu(e): LET ty=ey(e)+ev(e): LET rt=6: GO TO 992
957 IF cango THEN LET ex(e)=tx: LET ey(e)=ty
958 IF NOT cango THEN LET eu(e)=-eu(e): LET ev(e)=-ev(e)
960 LET ez(e)=0.5+0.2*SIN (ea(e)/6): LET q=0.3: IF lt<0.75 THEN LET q=1
962 LET wf(e)=wf(e)+(q-wf(e))*0.04
965 LET ddx=px-ex(e): LET ddy=py-ey(e): IF ec(e)>0 THEN LET ec(e)=ec(e)-1
966 IF lt<0.75 AND ec(e)=0 AND ddx*ddx+ddy*ddy<0.4 AND ABS (pz-ez(e))<1 THEN LET en=en-8: LET hurt=6: LET ec(e)=40: LET eu(e)=-eu(e): LET ev(e)=-ev(e): LET pvx=ddx*0.3: LET pvy=ddy*0.3: LET kp=5: LET cnt=4: LET gx=px: LET gy=py: LET gz=pz+1.6: GO SUB 1095.5
967 IF lt<0.75 THEN LET d=SQR (ddx*ddx+ddy*ddy): IF d<nd THEN LET nd=d: LET nlx=ex(e): LET nly=ey(e): LET nk=2
970 GO TO 906
992 LET cango=0: IF tx<0.35 OR tx>7.65 OR ty<0.35 OR ty>7.65 THEN GO TO 996: REM can an ant or a wraith be at (tx,ty)? inside the room, over bare dry floor; then back to rt
994 LET cango=1: FOR q=0 TO 3: LET ci=INT (tx-0.3+0.6*(q-2*INT (q/2)))+1: LET cj=INT (ty-0.3+0.6*INT (q/2))+1: IF ht(rm,ci,cj)>0 OR fl(rm,ci,cj)=2 THEN LET cango=0
995 NEXT q
996 IF rt=4 THEN LET rt=0: GO TO 931
997 IF rt=5 THEN LET rt=0: GO TO 934
998 LET rt=0: GO TO 957
1000 REM ======================== herbs and hallows, spikes, the altar ========================
1005 FOR i=1 TO ni: IF ir(i)<>rm OR ig(i)=1 THEN GO TO 1040
1007 IF ik(i)<5 AND RND<0.07 THEN LET kp=7: LET cnt=1: LET gx=ix(i)+(RND-0.5)*0.5: LET gy=iy(i)+(RND-0.5)*0.5: LET gz=iz(i)+0.5+RND*0.8: GO SUB 1095.5
1010 LET ddx=px-ix(i): LET ddy=py-iy(i): LET d2=ddx*ddx+ddy*ddy: IF ik(i)<5 AND hn3<2 AND msgt=0 AND d2<1.6 AND iz(i)-pz>1.3 THEN LET hn3=hn3+1: LET msg$="TOO HIGH. A CRATE WOULD HELP": LET msgt=70: GO SUB 3500
1011 IF ik(i)<5 AND d2<nd*nd THEN LET nd=SQR d2: LET nlx=ix(i): LET nly=iy(i): LET nk=0
1012 IF d2>0.72 OR ABS (pz-iz(i))>1 THEN GO TO 1040: REM within reach: a jump beside a plinth will do
1015 LET ig(i)=1: LET kp=8: LET cnt=14: LET gx=ix(i): LET gy=iy(i): LET gz=iz(i)+0.8: GO SUB 1095.5: LET pose=30: LET vsq=vsq+0.15
1017 IF ik(i)=5 THEN LET en=en+35: IF en>100 THEN LET en=100
1020 IF ik(i)=5 THEN LET msg$="A HEALING HERB": LET msgt=50: GO SUB 3500: TONE 12: TONE 16: GO TO 1040
1025 LET got(ik(i))=1: LET msg$=hn$(ik(i)): LET msgt=90: GO SUB 3500: GO SUB 3300: TONE 7: TONE 12: TONE 19
1040 NEXT i
1045 IF px<0 OR px>=8 OR py<0 OR py>=8 THEN GO TO 1080
1050 IF pz<0.05 AND fl(rm,INT px+1,INT py+1)=1 THEN LET en=en-0.5: IF hurt<2 THEN LET hurt=2
1060 IF rm=9 AND pz>0.9 AND bt(rm,INT px+1,INT py+1,1)=3 THEN GO SUB 1070: REM on the golden altar with all four hallows, the quest is done
1065 GO TO 1080
1070 IF got(1)+got(2)+got(3)+got(4)=4 THEN LET won=1: RETURN
1072 IF msgt=0 THEN LET msg$="THE ALTAR WAITS FOR ALL FOUR": LET msgt=60: GO SUB 3500
1074 RETURN
1080 IF hurt=6 THEN TONE -20
1082 IF hurt>0 THEN BORDER 2: LET hurt=hurt-1: IF hurt=0 THEN BORDER 0
1090 IF msgt>0 THEN LET msgt=msgt-1: IF msgt=0 THEN GO SUB 3500
1095 GO TO 1200
1096 LET k=0: LET kn=zk(kp): LET sp2=zs(kp): LET sw2=zw(kp): LET life=zl(kp): REM cnt particles of preset kp at (gx,gy,gz): its kind, how far they fly, how fast they rise and how long they live
1097 LET k=k+1: IF k>30 OR cnt<=0 THEN RETURN
1098 IF kl(k)>0 THEN GO TO 1097
1099 LET an=RND*2*PI: LET q=0.5+RND*0.5: LET kk(k)=kn: LET kx(k)=gx: LET ky(k)=gy: LET kz(k)=gz: LET ku(k)=COS an*sp2*q: LET kv(k)=SIN an*sp2*q: LET kw(k)=sw2*(0.6+RND*0.6): LET kl(k)=life+INT (RND*life/2): LET km(k)=kl(k): LET cnt=cnt-1: GO TO 1097
1100 REM ---- the brain behind the body: which way he faces, and what he gets up to when there is nothing to do ----
1102 IF spd<0.01 THEN GO TO 1110
1104 LET fmt=1: IF syv<0 THEN LET fmt=2
1105 IF ABS syv<=0.45*ABS sxv THEN LET fmt=3
1106 IF ABS sxv>0.01 THEN LET ew=SGN sxv
1108 IF fm+fmt=3 THEN LET fm=3: LET tn=6: GO TO 1110: REM from front to back or back to front he turns through a profile
1109 IF tn=0 THEN LET fm=fmt
1110 IF tn>0 THEN LET tn=tn-1
1112 LET pbc=0: IF (tdx<>0 OR tdy<>0) AND ABS (px-opx)+ABS (py-opy)<0.01 AND pz=gh THEN LET pbc=pbo+1
1113 LET pbo=pbc: REM pushing against something that will not move
1114 LET fear=0: IF nk=1 AND nd<1.8 AND pz<0.9 THEN LET fear=1: LET im=0: LET idt=0
1116 IF spd>0.01 OR pz>gh+0.01 OR jant>0 OR fear THEN LET idt=0: LET idn=0: LET im=0: GO TO 1140
1118 LET idt=idt+1: IF im>0 AND im<6 THEN LET imt=imt-1: IF imt<=0 THEN LET im=0: LET idn=idt+40: REM idt counts how long he has stood still; idn keeps a pause between idle turns
1120 IF im=0 AND idt>320 AND carry=0 THEN LET im=6: REM long enough, and he sits down
1122 IF im=0 AND idt>45 AND idt>idn AND carry=0 AND RND<0.03 THEN GO SUB 1180
1124 IF im=0 AND idt>70 AND idt>idn AND RND<0.025 THEN LET im=1+INT (RND*5): LET imt=60+INT (RND*60): REM 1 taps a toe, 2 hands in pockets, 3 looks about, 4 stretches, 5 shifts his weight
1126 IF im=3 THEN LET fm=3: LET ew=1: IF imt<60 THEN LET ew=-1
1128 IF im=3 AND imt<25 THEN LET fm=1
1130 IF im=6 OR im=2 THEN LET fm=1
1132 IF im=7 THEN LET fm=3: LET ew=-lsd
1140 LET q=0: IF im=6 THEN LET q=1
1142 LET sta=sta+(q-sta)*0.12: LET q=0: IF im=7 THEN LET q=lsd
1143 IF fear THEN LET q=-0.7*SGN (lpx+0.001)
1144 LET lea=lea+(q-lea)*0.15
1146 IF im=6 AND idt>420 AND ft-55*INT (ft/55)=0 THEN LET kp=13: LET cnt=1: LET gx=px: LET gy=py: LET gz=pz+2.1: GO SUB 1095.5
1150 LET lkx=0: LET lky=0: IF nd<3.5 THEN LET q=nlx-px: LET w=nly-py: LET vx2=m11*q+m12*w: LET vy2=m21*q+m22*w: LET q=vx2-vy2: LET w=(vx2+vy2)*0.5: LET d=SQR (q*q+w*w)+0.01: LET lkx=0.75*q/d: LET lky=0.55*w/d
1152 IF nd>=3.5 AND spd>0.01 THEN LET lkx=0.5*SGN sxv
1154 LET lpx=lpx+(lkx-lpx)*0.2: LET lpy=lpy+(lky-lpy)*0.2: REM his eyes go to the nearest danger or treasure, or the way he walks
1156 IF msgt=0 AND ft-12*INT (ft/12)=0 THEN GO SUB 1170
1158 GO TO 796
1170 LET cx=px+facex*0.8: LET cy=py+facey*0.8: IF cx<0 OR cx>=8 OR cy<0 OR cy>=8 THEN RETURN: REM a word of advice, now and then
1172 LET ci=INT cx+1: LET cj=INT cy+1: LET h=ht(rm,ci,cj): IF carry=0 AND h>0 AND hn1<3 THEN IF bt(rm,ci,cj,h)=2 AND ABS (h-1-pz)<0.6 THEN LET hn1=hn1+1: LET msg$="T LIFTS THE CRATE": LET msgt=50: GO SUB 3500: RETURN
1174 IF carry=1 AND hn2<2 THEN LET hn2=hn2+1: LET msg$="T SETS IT DOWN. CLIMB ON IT!": LET msgt=60: GO SUB 3500
1176 RETURN
1180 FOR q=-1 TO 1 STEP 2: LET cx=px+(m11-m21)*q*0.45: LET cy=py+(m12-m22)*q*0.45: REM a block close beside him on the screen? he leans on it
1182 IF cx>=0 AND cx<8 AND cy>=0 AND cy<8 THEN IF ht(rm,INT cx+1,INT cy+1)>pz+0.6 THEN LET im=7: LET lsd=q
1184 NEXT q: RETURN
1200 REM ======================== particles, then the days ========================
1202 LET nff=0: FOR k=1 TO 30: IF kl(k)=0 THEN GO TO 1214
1204 LET kl(k)=kl(k)-1: LET kx(k)=kx(k)+ku(k): LET ky(k)=ky(k)+kv(k): LET kz(k)=kz(k)+kw(k)
1206 IF kk(k)=1 THEN LET ku(k)=ku(k)*0.88: LET kv(k)=kv(k)*0.88: LET kw(k)=kw(k)*0.9
1207 IF kk(k)=2 THEN LET kw(k)=kw(k)-0.03: IF kz(k)<0 THEN LET kl(k)=0
1208 IF kk(k)=4 THEN LET ku(k)=ku(k)*0.92: LET kv(k)=kv(k)*0.92
1210 IF kk(k)=5 THEN LET nff=nff+1: LET ku(k)=ku(k)*0.96+(RND-0.5)*0.006: LET kv(k)=kv(k)*0.96+(RND-0.5)*0.006: LET kw(k)=0.01*SIN (kl(k)/9)
1212 IF kk(k)=5 THEN IF kx(k)<0.3 OR kx(k)>7.7 OR ky(k)<0.3 OR ky(k)>7.7 THEN LET ku(k)=-ku(k): LET kv(k)=-kv(k)
1214 NEXT k
1216 IF lt<0.85 AND nff<6 AND RND<0.05 THEN LET kp=9: LET cnt=1: LET gx=0.8+RND*6.4: LET gy=0.8+RND*6.4: LET gz=0.8+RND*0.8: GO SUB 1095.5
1218 IF titlemode THEN RETURN
1220 LET ft=ft+1: LET day=INT (ft/dl)+1: LET ph=(ft-(day-1)*dl)/dl: REM the days: the sun, then the moon; at night the colours sink and the sidhe wake
1222 LET lt=1: IF ph>0.55 THEN LET lt=0.5: IF ph<0.62 THEN LET lt=1-0.5*(ph-0.55)/0.07
1223 IF ph<0.07 THEN LET lt=0.5+0.5*ph/0.07
1224 IF INT (lt*16)<>lq THEN LET lq=INT (lt*16): GO SUB 3700
1225 IF day<>dshown THEN GO SUB 3300
1227 IF INT (en/10+0.5)<>eb THEN GO SUB 3320
1228 IF rta>0 THEN GO SUB 1244
1229 IF ft-25*INT (ft/25)=0 THEN GO SUB 3340
1230 GO TO 2400
1244 LET rta=rta-1: IF rta=6 THEN LET vr=vr+rdir: IF vr<0 THEN LET vr=3: REM a quarter turn: the picture folds to a line, the room turns behind it, and it opens again
1245 IF vr>3 THEN LET vr=0
1246 IF rta=6 THEN GO SUB 3870: GO SUB 4500
1247 LET q=ABS (rta-6)/6: FXP "_xscale", 100*q: FXP "_x", 128-128*q: RETURN
2400 REM ======================== a frame: floor and water, grid, shimmer, then faces and figures interleaved back to front ========================
2402 IF trn>0 THEN LET trn=trn-1: LET q=trn/12: FXP "_alpha", 100-100*q*q: FXP "_y", 14*q*q*q
2405 FX "clear": FX "lineStyle", 1, #1c1424, 85: LET p=1: LET rq=1
2410 IF p<=nwa THEN GO TO 2460
2412 FX "lineStyle", 1, 0, 14: FOR k=1 TO 7: FX "moveTo", ox+k*hw, oy+k*hh: FX "lineTo", ox+(k-8)*hw, oy+(k+8)*hh: FX "moveTo", ox-k*hw, oy+k*hh: FX "lineTo", ox+(8-k)*hw, oy+(8+k)*hh: NEXT k
2414 FX "lineStyle", 1, #d8ecff, 45: FOR w=1 TO nwc: LET q=SIN (ft/7+wcx(w)*1.7+wcy(w)*1.1): LET sx=ox+(wcx(w)-wcy(w))*hw+q*3: LET sy=oy+(wcx(w)+wcy(w))*hh+q-1: FX "moveTo", sx-3, sy: FX "lineTo", sx+2, sy-1: NEXT w
2416 FX "lineStyle", 1, #1c1424, 85
2422 LET na=0: LET pk0=99: IF titlemode<>1 THEN LET vpx=ux0+m11*px+m12*py: LET vpy=uy0+m21*px+m22*py: LET na=1: LET pk0=INT vpx+INT vpy+0.5: LET ok(1)=pk0: LET oc(1)=0: LET psx=ox+(vpx-vpy)*hw: LET psy=oy+(vpx+vpy)*hh-pz*bh: REM each figure is drawn just after the diagonal its cell is on
2424 FOR e=1 TO ne: IF er(e)=rm THEN LET na=na+1: LET ok(na)=INT (ux0+m11*ex(e)+m12*ey(e))+INT (uy0+m21*ex(e)+m22*ey(e))+0.5: LET oc(na)=100+e
2425 NEXT e
2426 FOR i=1 TO ni: IF ir(i)=rm AND ig(i)=0 THEN LET na=na+1: LET ok(na)=INT (ux0+m11*ix(i)+m12*iy(i))+INT (uy0+m21*ix(i)+m22*iy(i))+0.5: LET oc(na)=200+i
2427 NEXT i
2430 FOR a=2 TO na: LET k0=ok(a): LET c0=oc(a): LET b=a-1
2432 IF b>=1 THEN IF ok(b)>k0 THEN LET ok(b+1)=ok(b): LET oc(b+1)=oc(b): LET b=b-1: GO TO 2432
2434 LET ok(b+1)=k0: LET oc(b+1)=c0: NEXT a
2440 LET a=0: LET rq=2
2442 LET a=a+1: IF a>na THEN GO TO 2454
2445 IF p<=nq THEN IF qs(p)<ok(a) THEN GO TO 2460
2448 LET oo=oc(a): LET fa=1: LET fmv=1: LET lnx=0: LET blv=0: LET bk=1: LET olc=#1c1424: IF oo=0 THEN GO TO 2700: REM figure a: each kind sets its rig, then the shape drawer at 3000 draws it and comes back to 2442
2450 IF oo<200 THEN LET e=oo-100: IF ek(e)=1 THEN GO TO 2800
2451 IF oo<200 THEN GO TO 2900
2452 LET i=oo-200: IF ik(i)<5 THEN GO TO 3100
2453 GO TO 3150
2454 LET rq=3
2455 IF p<=nq THEN GO TO 2460
2456 GO TO 3200
2460 IF qt(p)=1 THEN GO TO 2467: REM face p: a fill (outlined, or a shadow without), or a line of light; then on by rq
2461 LET fa2=qa(p): IF qs(p)>pk0 THEN IF qbr(p)>psx-8 AND qbl(p)<psx+8 AND qbb(p)>psy-30 AND qbt(p)<psy THEN LET fa2=fa2*0.3: FX "lineStyle", 1, #1c1424, 30: REM in front of Oisin and over him: glass
2462 IF qt(p)=2 THEN FX "lineStyle"
2463 FX "beginFill", pal(qc(p)), fa2: FX "moveTo", qx(p,1), qy(p,1): FX "lineTo", qx(p,2), qy(p,2): FX "lineTo", qx(p,3), qy(p,3): IF qn(p)>3 THEN FX "lineTo", qx(p,4), qy(p,4)
2464 IF qn(p)>4 THEN FX "lineTo", qx(p,5), qy(p,5): IF qn(p)>5 THEN FX "lineTo", qx(p,6), qy(p,6)
2465 FX "endFill": IF qt(p)=2 OR fa2<qa(p) THEN FX "lineStyle", 1, #1c1424, 85
2466 GO TO 2470
2467 IF qs(p)>pk0 THEN IF qbr(p)>psx-8 AND qbl(p)<psx+8 AND qbb(p)>psy-30 AND qbt(p)<psy THEN GO TO 2470
2468 FX "lineStyle", 1.2, pal(qc(p)), qa(p): FX "moveTo", qx(p,1), qy(p,1): FX "lineTo", qx(p,2), qy(p,2): IF qn(p)>2 THEN FX "lineTo", qx(p,3), qy(p,3)
2469 FX "lineStyle", 1, #1c1424, 85
2470 LET p=p+1: IF rq=1 THEN GO TO 2410
2472 IF rq=2 THEN GO TO 2445
2474 GO TO 2455
2500 REM ---- shape sh at (sx,sy), scaled by scx and scy about its feet, each point moved by its rig; then back by bk ----
2501 FX "lineStyle", 1, olc, 85*fa: LET pp=sf(sh)-1
2502 LET pp=pp+1: IF pp>sl(sh) THEN GO TO 2540
2504 LET f=pf(pp): IF f=0 THEN GO TO 2508: REM shows: 1 front, 2 back, 3 and 4 front eyes open and shut, 5 profile, 6 front or profile, 7 and 8 profile eye open and shut
2505 IF (f=1 AND fmv<>1) OR (f=2 AND fmv<>2) OR (f=5 AND fmv<>3) OR (f=6 AND fmv=2) THEN GO TO 2502
2506 IF (f=3 AND (fmv<>1 OR blv=1)) OR (f=4 AND (fmv<>1 OR blv=0)) THEN GO TO 2502
2507 IF (f=7 AND (fmv<>3 OR blv=1)) OR (f=8 AND (fmv<>3 OR blv=0)) THEN GO TO 2502
2508 LET v=ps(pp): LET kd=pk(pp): IF po(pp)=0 THEN FX "lineStyle"
2510 IF kd=2 THEN LET ecx=sx+gxv(v)*scx-gyv(v)*lnx+rdx(grv(v)): LET ecy=sy+gyv(v)*scy+rdy(grv(v)): LET erx=pw(pp)*ABS scx: LET ery=pe(pp)*scy: FX "beginFill", pc(pp), pa(pp)*fa: LET re=10: GO TO 3176
2511 IF kd=2 THEN FX "endFill": GO TO 2530
2514 IF kd=3 THEN FX "lineStyle", pw(pp), pc(pp), pa(pp)*fa
2516 IF kd=1 THEN FX "beginFill", pc(pp), pa(pp)*fa
2518 FX "moveTo", sx+gxv(v)*scx-gyv(v)*lnx+rdx(grv(v)), sy+gyv(v)*scy+rdy(grv(v)): FOR w=v+1 TO v+pn(pp)-1: FX "lineTo", sx+gxv(w)*scx-gyv(w)*lnx+rdx(grv(w)), sy+gyv(w)*scy+rdy(grv(w)): NEXT w: IF kd=3 THEN GO TO 2532
2520 FX "endFill"
2530 IF po(pp)=0 THEN FX "lineStyle", 1, olc, 85*fa
2531 GO TO 2502
2532 FX "lineStyle", 1, olc, 85*fa: GO TO 2502
2540 IF bk=2 THEN GO TO 2738
2542 GO TO 2442
2700 REM ---- Oisin: his shadow, the tile he stands on, then his rig, posed by what he is doing ----
2702 LET sx=ox+(vpx-vpy)*hw: LET sy=oy+(vpx+vpy)*hh-pz*bh: LET gs=0: IF px>=0 AND px<8 AND py>=0 AND py<8 THEN LET gs=ht(rm,INT px+1,INT py+1)
2704 LET q=pz-gs: IF q<0 THEN LET q=0
2705 IF q>2.5 THEN LET q=2.5
2706 FX "lineStyle": FX "beginFill", 0, 40-11*q: LET ecx=sx: LET ecy=oy+(vpx+vpy)*hh-gs*bh: LET erx=6.5-1.2*q: LET ery=erx*0.5: LET re=7: GO TO 3176
2707 FX "endFill": LET ci=INT vpx: LET cj=INT vpy: IF ci<0 OR ci>7 OR cj<0 OR cj>7 THEN GO TO 2709
2708 LET q1=oy+(ci+cj)*hh-gs*bh: LET q2=ox+(ci-cj)*hw: FX "lineStyle", 1.2, #fff0b0, 45: FX "beginFill", #fff4c0, 8: FX "moveTo", q2, q1: FX "lineTo", q2+hw, q1+hh: FX "lineTo", q2, q1+2*hh: FX "lineTo", q2-hw, q1+hh: FX "lineTo", q2, q1: FX "endFill": REM the tile he is over, lit, so near and far are plain
2709 IF pz>gs+0.3 THEN FX "lineStyle", 1, #fff0b0, 35: FX "moveTo", sx, sy-1: FX "lineTo", sx, oy+(vpx+vpy)*hh-gs*bh: REM and a line down to it while he is in the air
2710 LET q=SIN (wph): LET rdx(1)=2.4*q*mv: LET rdy(1)=-0.8*(q+ABS q)*mv: LET rdx(2)=-2.4*q*mv: LET rdy(2)=-0.8*(ABS q-q)*mv: REM feet swing and lift in arcs
2712 IF pz>gs+0.05 THEN LET rdx(1)=1.2*ew: LET rdy(1)=-2.2: LET rdx(2)=-1*ew: LET rdy(2)=-1.5
2714 LET rdx(3)=hemx*0.12+0.5*ew*mv: LET rdy(3)=0.35*SIN (ft/11)*(1-mv)-0.7*ABS (q)*mv: REM the head leads, bobs with each step and breathes at rest
2716 LET rdx(4)=hemx: LET rdy(4)=-ABS (hemx)*0.15: LET rdx(5)=hemx*1.6: LET rdy(5)=hairy
2718 LET rdx(6)=-1.6*q*mv: LET rdy(6)=0: LET rdx(7)=1.6*q*mv: LET rdy(7)=0
2720 IF pose>0 OR carry THEN LET rdx(6)=-1.2*ew: LET rdy(6)=-9: LET rdx(7)=1.2*ew: LET rdy(7)=-9
2721 IF pz>gs+0.05 AND pose=0 AND carry=0 THEN LET rdy(6)=-3: LET rdy(7)=-3: IF vz<-0.15 THEN LET rdy(6)=-6+3*SIN (ft*0.9): LET rdy(7)=-6+3*SIN (ft*0.9+2): LET rdx(6)=-2*ew: LET rdx(7)=2*ew
2722 IF im=1 THEN LET rdy(1)=-1.3*ABS (SIN (imt*0.45)): LET rdx(1)=0.6*ew: REM idling: taps a toe
2723 IF im=2 THEN LET rdx(6)=2.6*ew: LET rdy(6)=1.4: LET rdx(7)=-2.6*ew: LET rdy(7)=1.4: LET lnx=-0.05*ew: REM hands in his pockets, leaning back a touch
2724 IF im=4 THEN LET q=SIN (PI*imt/60): LET rdy(6)=-11*q: LET rdy(7)=-11*q: LET rdx(6)=-1.5*ew*q: LET rdx(7)=1.5*ew*q: REM a long stretch
2725 IF im=5 THEN LET sx=sx+0.9*SIN (imt/9): LET rdx(3)=rdx(3)+0.5*SIN (imt/9): LET rdx(4)=rdx(4)-0.6*SIN (imt/9): REM shifting his weight
2726 IF sta<0.02 THEN GO TO 2729
2727 LET sy=sy+5.5*sta: LET rdx(1)=rdx(1)*(1-sta)+4*ew*sta: LET rdy(1)=rdy(1)*(1-sta)-6*sta: LET rdx(2)=rdx(2)*(1-sta)+3*ew*sta: LET rdy(2)=rdy(2)*(1-sta)-6*sta: REM sitting, legs out
2728 LET rdx(6)=rdx(6)*(1-sta)+3.2*ew*sta: LET rdy(6)=rdy(6)+2*sta: LET rdx(7)=rdx(7)*(1-sta)+3.2*ew*sta: LET rdy(7)=rdy(7)+2*sta: LET rdy(3)=rdy(3)+0.7*sta*SIN (ft/23): LET rdy(4)=rdy(4)-3*sta: REM hands on knees, nodding off
2729 LET lnx=lnx+0.16*lea: IF ABS lea>0.3 AND fear=0 THEN LET rdx(6)=3.2*ew: LET rdx(7)=-3.2*ew: LET rdy(6)=-2: LET rdy(7)=-2.4: LET rdx(1)=rdx(1)-1.6*ew: REM leaning on a block, arms and ankles crossed
2730 IF pbc>4 THEN LET lnx=lnx+0.14*ew: LET rdx(6)=4*ew: LET rdx(7)=4.6*ew: LET rdy(6)=-3: LET rdy(7)=-3.4: REM shoving at what will not move
2731 IF fear THEN LET rdy(6)=-5: LET rdy(7)=-5: LET sx=sx+(RND-0.5)*1.2: REM an ant too close: recoil and tremble
2732 LET rdx(8)=rdx(3)+lpx: LET rdy(8)=rdy(3)+lpy: REM the eyes ride on the head, looking
2733 LET scy=sq: LET scx=ew/SQR (sq): IF fm=3 THEN LET scx=scx*0.8
2734 IF hurt>3 THEN LET sx=sx+(RND-0.5)*2.5
2735 LET fmv=fm: IF blk>0 THEN LET blv=1
2736 LET sh=1: LET bk=2: GO TO 2500
2738 IF carry THEN LET mx=sx: LET my=sy-30*sq-6: LET ms=5: LET c1=pal(6): LET c2=pal(7): LET c3=pal(8): FX "beginFill", c1, 100: FX "moveTo", mx, my-ms/2: FX "lineTo", mx+ms, my: FX "lineTo", mx, my+ms/2: FX "lineTo", mx-ms, my: FX "endFill": FX "beginFill", c2, 100: FX "moveTo", mx-ms, my: FX "lineTo", mx, my+ms/2: FX "lineTo", mx, my+ms*1.5: FX "lineTo", mx-ms, my+ms: FX "endFill": FX "beginFill", c3, 100: FX "moveTo", mx, my+ms/2: FX "lineTo", mx+ms, my: FX "lineTo", mx+ms, my+ms: FX "lineTo", mx, my+ms*1.5: FX "endFill"
2740 GO TO 2442
2800 REM ---- a giant ant, side on, facing the way it runs: a tripod gait, a bobbing body, antennae that twitch ----
2802 LET sx=ox+(kxa+kxx*ex(e)+kxy*ey(e))*hw: LET sy=oy+(kya+kyx*ex(e)+kyy*ey(e))*hh: LET q=ea(e)*0.9: IF ec(e)>0 THEN LET q=ea(e)*1.4
2804 FX "lineStyle": FX "beginFill", 0, 35: LET ecx=sx: LET ecy=sy: LET erx=10: LET ery=3.6: LET re=8: GO TO 3176
2805 FX "endFill"
2806 LET s1=SIN q: LET rdx(1)=2*s1: LET rdy(1)=-0.7*(s1+ABS s1): LET rdx(2)=-2*s1: LET rdy(2)=-0.7*(ABS s1-s1)
2808 LET rdx(3)=0: LET rdy(3)=0.5*SIN (q*2): LET rdx(5)=0.9*SIN (q*0.8): LET rdy(5)=0.7*COS (q*1.1)
2810 LET q=(m11-m21)*eu(e)+(m12-m22)*ev(e): LET scx=1: IF q<0 THEN LET scx=-1
2812 LET scy=1+0.05*SIN (q*2): LET sh=2: GO TO 2500
2900 REM ---- a wraith: it breathes, its hem and wisps ripple, its arms drift, it blinks; by day it is barely there ----
2902 LET sx=ox+(kxa+kxx*ex(e)+kxy*ey(e))*hw: LET sy=oy+(kya+kyx*ex(e)+kyy*ey(e))*hh: LET gy0=sy: LET sy=sy-ez(e)*bh: LET fa=wf(e): LET olc=#6070b0
2904 FX "lineStyle": FX "beginFill", 0, 18*fa: LET ecx=sx: LET ecy=gy0: LET erx=6: LET ery=2.6: LET re=9: GO TO 3176
2905 FX "endFill"
2906 LET q=ea(e)/3: LET rdx(4)=1.6*SIN q: LET rdy(4)=0.9*COS q: LET rdx(5)=2.6*SIN (q+1): LET rdy(5)=1.3*SIN (q*1.4): LET rdx(6)=0: LET rdy(6)=1.6*SIN (q*0.8)
2908 LET scx=1+0.04*SIN (q*0.6): LET scy=1+0.05*COS (q*0.6): IF ea(e)-80*INT (ea(e)/80)<4 THEN LET blv=1
2910 LET sh=3: GO TO 2500
3100 REM ---- a hallow: a shadow on the stone below, a glow that breathes, and the hallow bobbing and spinning like a coin ----
3102 LET sx=ox+(kxa+kxx*ix(i)+kxy*iy(i))*hw: LET sy=oy+(kya+kyx*ix(i)+kyy*iy(i))*hh-iz(i)*bh
3104 FX "lineStyle": FX "beginFill", 0, 25: LET ecx=sx: LET ecy=sy: LET erx=5: LET ery=2.2: LET re=11: GO TO 3176
3105 FX "endFill"
3106 LET sy=sy-4-2.5*SIN (ft/9+i): LET gq=1+0.12*SIN (ft/7+i): LET ecx=sx: LET ecy=sy-11
3108 FX "beginFill", #ffe070, 9: LET erx=15*gq: LET ery=15*gq: LET re=12: GO TO 3176
3109 FX "endFill": FX "beginFill", #ffe070, 12: LET erx=10*gq: LET ery=10*gq: LET re=13: GO TO 3176
3110 FX "endFill": FX "beginFill", #fff4c0, 18: LET erx=6*gq: LET ery=6*gq: LET re=14: GO TO 3176
3111 FX "endFill": LET scx=COS (ft/16+i*1.7): IF ABS scx<0.18 THEN LET scx=0.18*SGN (scx+0.001)
3112 LET scy=1: LET sh=3+ik(i): GO TO 2500
3150 REM ---- a healing herb, swaying ----
3152 LET sx=ox+(kxa+kxx*ix(i)+kxy*iy(i))*hw: LET sy=oy+(kya+kyx*ix(i)+kyy*iy(i))*hh-iz(i)*bh: LET rdx(4)=1.4*SIN (ft/13+i): LET rdy(4)=0: LET scx=1: LET scy=1+0.05*SIN (ft/9+i): LET sh=8: GO TO 2500
3176 FX "moveTo", ecx+erx, ecy: FOR q=1 TO 8: FX "curveTo", ecx+erx*ux(q), ecy+ery*uy(q), ecx+erx*vx(q), ecy+ery*vy(q): NEXT q: REM an ellipse round (ecx,ecy), radii erx and ery, its fill already begun; then back to the line re names
3177 IF re=10 THEN GO TO 2511
3178 IF re=7 THEN GO TO 2707
3179 IF re=8 THEN GO TO 2805
3180 IF re=9 THEN GO TO 2905
3181 IF re=11 THEN GO TO 3105
3182 IF re=12 THEN GO TO 3109
3183 IF re=13 THEN GO TO 3110
3184 IF re=14 THEN GO TO 3111
3185 IF re=1 THEN GO TO 3207
3186 IF re=2 THEN GO TO 3223
3187 IF re=3 THEN GO TO 3225
3188 IF re=4 THEN GO TO 3240
3189 IF re=5 THEN GO TO 3241
3190 GO TO 3245
3200 REM ---- particles under the dark: dust, drops, stars ----
3202 FOR k=1 TO 30: IF kl(k)=0 OR kk(k)>3 THEN GO TO 3212
3204 LET sx=ox+(kxa+kxx*kx(k)+kxy*ky(k))*hw: LET sy=oy+(kya+kyx*kx(k)+kyy*ky(k))*hh-kz(k)*bh: LET lf=kl(k)/km(k)
3206 IF kk(k)=1 THEN FX "lineStyle": FX "beginFill", #e0d4c0, 50*lf: LET ecx=sx: LET ecy=sy: LET erx=1.4+3.6*(1-lf): LET ery=erx*0.62: LET re=1: GO TO 3176
3207 IF kk(k)=1 THEN FX "endFill"
3208 IF kk(k)=2 THEN FX "lineStyle", 1.6, #b8dcff, 95*lf: FX "moveTo", sx, sy: FX "lineTo", sx-(ku(k)-kv(k))*hw*1.6, sy-(ku(k)+kv(k))*hh*1.6+kw(k)*bh*1.6
3210 IF kk(k)=3 THEN LET q=2.5*lf+1: FX "lineStyle", 1.5, #ff5050, 100*lf: FX "moveTo", sx-q, sy: FX "lineTo", sx+q, sy: FX "moveTo", sx, sy-q: FX "lineTo", sx, sy+q
3212 NEXT k
3216 LET dk=52*(1-lt)/0.5: IF dk<2 THEN GO TO 3230: REM night: three veils of dark, each with a hole of lamplight round Oisin (or the altar), so the light falls off softly
3218 LET lcx=ox+(kxa+kxx*px+kxy*py)*hw: LET lcy=oy+(kya+kyx*px+kyy*py)*hh-pz*bh-12: IF titlemode=1 THEN LET lcx=128: LET lcy=70
3220 LET fq=1+0.04*SIN (ft*0.9)+0.03*SIN (ft*2.3): FX "lineStyle": FOR ly=1 TO 3: LET ecx=lcx: LET ecy=lcy: LET erx=(28+16*ly)*fq: LET ery=erx*0.62
3222 FX "beginFill", 0, dk*(0.46-0.07*ly): FX "moveTo", 0, 0: FX "lineTo", 256, 0: FX "lineTo", 256, 152: FX "lineTo", 0, 152: FX "lineTo", 0, 0: LET re=2: GO TO 3176
3223 FX "endFill": NEXT ly
3224 FX "beginFill", #ffb050, dk*0.12: LET erx=26*fq: LET ery=16*fq: LET re=3: GO TO 3176
3225 FX "endFill"
3230 REM sparkles and fireflies shine above the dark
3232 FOR k=1 TO 30: IF kl(k)=0 OR kk(k)<4 THEN GO TO 3242
3234 LET sx=ox+(kxa+kxx*kx(k)+kxy*ky(k))*hw: LET sy=oy+(kya+kyx*kx(k)+kyy*ky(k))*hh-kz(k)*bh: LET lf=kl(k)/km(k)
3236 IF kk(k)=4 THEN LET q=3.6*SIN (PI*lf): FX "lineStyle", 1.3, #fff4b0, 100: FX "moveTo", sx-q, sy: FX "lineTo", sx+q, sy: FX "moveTo", sx, sy-q: FX "lineTo", sx, sy+q: LET q=q*0.5: FX "moveTo", sx-q, sy-q: FX "lineTo", sx+q, sy+q: FX "moveTo", sx-q, sy+q: FX "lineTo", sx+q, sy-q: GO TO 3242
3237 IF kk(k)=6 THEN LET q=1.5+1.5*(1-lf): FX "lineStyle", 1.2, #e0e8ff, 100*lf: FX "moveTo", sx-q, sy-q: FX "lineTo", sx+q, sy-q: FX "lineTo", sx-q, sy+q: FX "lineTo", sx+q, sy+q: GO TO 3242
3238 LET fq=0.5+0.5*SIN (kl(k)/5): IF lf<0.15 THEN LET fq=fq*lf/0.15
3239 FX "lineStyle": FX "beginFill", #d8ff70, 28*fq: LET ecx=sx: LET ecy=sy: LET erx=3.4: LET ery=3.4: LET re=4: GO TO 3176
3240 FX "endFill": FX "beginFill", #f8ffd8, 95*fq: LET erx=1: LET ery=1: LET re=5: GO TO 3176
3241 FX "endFill"
3242 NEXT k
3244 FX "lineStyle": FX "beginFill", 0, 26: FX "moveTo", 0, 0: FX "lineTo", 256, 0: FX "lineTo", 256, 152: FX "lineTo", 0, 152: FX "lineTo", 0, 0: LET ecx=128: LET ecy=80: LET erx=127: LET ery=71: LET re=6: GO TO 3176: REM a soft vignette: the corners of the picture fall a little into shadow
3245 FX "endFill": IF titlemode=1 THEN GO TO 5330
3248 IF titlemode=2 THEN GO TO 5240
3250 GO TO 610
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
3600 REM ======================== a crate: take the one in front at our level, or put ours down there ========================
3605 LET cx=px+facex*0.8: LET cy=py+facey*0.8: IF cx<0 OR cx>=8 OR cy<0 OR cy>=8 THEN GO TO 3690
3610 LET ci=INT cx+1: LET cj=INT cy+1: LET h=ht(rm,ci,cj): IF carry=1 THEN GO TO 3650
3615 IF h=0 THEN GO TO 3690
3620 IF bt(rm,ci,cj,h)<>2 OR ABS (h-1-pz)>0.6 THEN GO TO 3690
3625 LET bt(rm,ci,cj,h)=0: LET ht(rm,ci,cj)=h-1: LET carry=1: LET vsq=vsq-0.12: GO SUB 4500: TONE 12: RETURN
3650 REM down it goes, onto ground no higher than our feet, where nobody is standing
3655 IF h>pz+0.05 OR h>=7 THEN GO TO 3690
3660 LET occ=0: FOR q=0 TO 3: LET cx=px-rr+2*rr*(q-2*INT (q/2)): LET cy=py-rr+2*rr*INT (q/2): IF INT cx+1=ci AND INT cy+1=cj THEN LET occ=1
3662 NEXT q
3665 FOR e=1 TO ne: IF er(e)=rm AND INT ex(e)+1=ci AND INT ey(e)+1=cj THEN LET occ=1
3667 NEXT e
3670 FOR i=1 TO ni: IF ir(i)=rm AND ig(i)=0 AND INT ix(i)+1=ci AND INT iy(i)+1=cj THEN LET occ=1
3672 NEXT i
3675 IF occ THEN GO TO 3690
3680 LET ht(rm,ci,cj)=h+1: LET bt(rm,ci,cj,h+1)=2: LET carry=0: GO SUB 4500: TONE 7: LET kp=10: LET cnt=5: LET gx=ci-0.5: LET gy=cj-0.5: LET gz=h: GO SUB 1095.5: RETURN
3690 TONE -10: RETURN
3700 REM ---- colours: each kind of block in three shades (top, left, right) and a bevel of light, for this room in this light ----
3701 LET lp=0.62+0.38*(lt-0.5)/0.5: LET pal(30)=0
3702 FOR t=1 TO 7: GO SUB 3730: FOR f=0 TO 2: LET fa=1
3704 IF f=1 THEN LET fa=0.74
3706 IF f=2 THEN LET fa=0.52
3708 LET cr=INT (br*fa*lp): LET cg=INT (bg*fa*lp): LET cb=INT (bb*fa*(lp+(1-lp)*0.6)): IF cb>255 THEN LET cb=255
3710 LET pal(t*3+f)=cr*65536+cg*256+cb: IF f>0 THEN GO TO 3718
3712 LET hr=INT (cr*1.25+24): LET hg=INT (cg*1.25+24): LET hb=INT (cb*1.25+30): IF hr>255 THEN LET hr=255
3714 IF hg>255 THEN LET hg=255
3716 IF hb>255 THEN LET hb=255
3718 IF f=0 THEN LET pal(31+t)=hr*65536+hg*256+hb
3720 NEXT f: NEXT t: RETURN
3730 IF t=1 THEN LET br=rs(rm,1): LET bg=rs(rm,2): LET bb=rs(rm,3)
3732 IF t=2 THEN LET br=176: LET bg=112: LET bb=56
3734 IF t=3 THEN LET br=232: LET bg=184: LET bb=48
3736 IF t=4 THEN LET br=rw(rm,1): LET bg=rw(rm,2): LET bb=rw(rm,3)
3738 IF t=5 THEN LET br=rf(rm,1): LET bg=rf(rm,2): LET bb=rf(rm,3)
3740 IF t=6 THEN LET br=50: LET bg=100: LET bb=200
3742 IF t=7 THEN LET br=185: LET bg=185: LET bb=200
3744 RETURN
3800 REM ======================== a new game ========================
3805 CLS: SPRITE CLEAR: GO SUB 4000: LET titlemode=0
3810 LET rm=5: LET px=4.5: LET py=4.5: LET pz=0: LET vz=0: LET facex=1: LET facey=0: LET fm=1: LET vr=0: LET en=100: LET carry=0: LET rt=0
3815 LET ft=150: LET day=1: LET lq=-1: LET lt=1: LET ph=0.1: LET won=0: LET msgt=0: LET tkheld=0: LET hurt=0
3817 LET pvx=0: LET pvy=0: LET sq=1: LET vsq=0: LET hemx=0: LET hmv=0: LET hairy=0: LET hrv=0: LET blk=0: LET pose=0: LET jant=0: LET wph=0: LET ew=1: LET dst=0: LET tn=0: LET im=0: LET idt=0: LET idn=0: LET sta=0: LET lea=0: LET lpx=0: LET lpy=0: LET pbo=0: LET fear=0: LET nd=99: LET hn1=0: LET hn2=0: LET hn3=0: LET rta=0: LET rkh=0: GO SUB 3870
3820 GO SUB 3850: LET msg$="FIND THE FOUR HALLOWS": LET msgt=100: GO SUB 3500
3825 GO TO 700
3850 REM ======================== into room rm: its colours, its faces and the panel; it fades in and settles ========================
3855 LET rrow=INT ((rm-1)/3): LET rcol=rm-1-rrow*3
3860 GO SUB 3700: GO SUB 4500: GO SUB 3300: LET entx=px: LET enty=py: LET trn=12: FOR k=1 TO 30: LET kl(k)=0: NEXT k: RETURN
3870 REM ---- the camera: a world point (x,y) is seen at (ux0+m11*x+m12*y, uy0+m21*x+m22*y), turned vr quarters ----
3872 LET m11=1: LET m12=0: LET m21=0: LET m22=1: LET ux0=0: LET uy0=0
3874 IF vr=1 THEN LET m11=0: LET m12=-1: LET m21=1: LET m22=0: LET ux0=8
3875 IF vr=2 THEN LET m11=-1: LET m22=-1: LET ux0=8: LET uy0=8
3876 IF vr=3 THEN LET m11=0: LET m12=1: LET m21=-1: LET m22=0: LET uy0=8
3878 LET kxa=ux0-uy0: LET kxx=m11-m21: LET kxy=m12-m22: LET kya=ux0+uy0: LET kyx=m11+m21: LET kyy=m12+m22: RETURN
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
4055 RESTORE 9400: READ ne: FOR e=1 TO ne: READ er(e), ek(e), ex(e), ey(e), ax: LET ez(e)=0: LET ea(e)=INT (RND*50): LET ec(e)=0: LET wf(e)=0.3: LET eu(e)=0: LET ev(e)=0
4060 IF ax=0 THEN LET eu(e)=0.05
4062 IF ax=1 THEN LET eu(e)=0.045
4064 IF ax=2 THEN LET ev(e)=0.045
4066 NEXT e
4070 REM the four hallows (kinds 1-4) and the herbs (kind 5), each on top of whatever is in its cell
4075 RESTORE 9450: READ ni: FOR i=1 TO ni: READ ik(i), ir(i), ci, cj: LET ix(i)=ci-0.5: LET iy(i)=cj-0.5: LET iz(i)=ht(ir(i),ci,cj): LET ig(i)=0: NEXT i
4080 FOR k=1 TO 4: LET got(k)=0: NEXT k: RETURN
4480 REM ---- the room as the camera sees it: heights, blocks and floors by view cell, and which of its edges have doors ----
4482 FOR j=1 TO 8: FOR i=1 TO 8: LET wi=i: LET wj=j: IF vr=1 THEN LET wi=j: LET wj=9-i
4484 IF vr=2 THEN LET wi=9-i: LET wj=9-j
4486 IF vr=3 THEN LET wi=9-j: LET wj=i
4488 LET vh(i,j)=ht(rm,wi,wj): LET vf(i,j)=fl(rm,wi,wj): FOR k=1 TO 7: LET vt(i,j,k)=bt(rm,wi,wj,k): NEXT k: NEXT i: NEXT j
4490 LET xn=0: LET xs=0: LET xw=0: LET xe=0: IF rrow>0 THEN LET xn=1
4491 IF rrow<2 THEN LET xs=1
4492 IF rcol>0 THEN LET xw=1
4493 IF rcol<2 THEN LET xe=1
4494 LET en2=xn: LET ew2=xw: LET es2=xs: LET ee2=xe: IF vr=1 THEN LET en2=xw: LET ew2=xs: LET es2=xe: LET ee2=xn
4495 IF vr=2 THEN LET en2=xs: LET ew2=xe: LET es2=xn: LET ee2=xw
4496 IF vr=3 THEN LET en2=xe: LET ew2=xn: LET es2=xw: LET ee2=xs
4498 RETURN
4500 REM ======================== the room as faces, back to front, with its shadows and lights ========================
4502 REM first the floor and its front edges (and a path out through each front doorway), then the water
4505 GO SUB 4480: LET nq=0: LET sk=-3: LET qtd=0: LET qad=100: LET nwc=0
4510 LET cc=15: LET a1=0: LET b1=0: LET a2=8: LET b2=8: LET zz=0: GO SUB 4680
4515 LET cc=16: LET g=8: LET a1=0: LET a2=8: LET z1=-0.4: LET z2=0: GO SUB 4685
4520 LET cc=17: LET g=8: LET a1=0: LET a2=8: LET z1=-0.4: LET z2=0: GO SUB 4690
4525 IF es2=1 THEN LET cc=15: LET a1=3: LET b1=8: LET a2=5: LET b2=8.8: LET zz=0: GO SUB 4680
4530 IF ee2=1 THEN LET cc=15: LET a1=8: LET b1=3: LET a2=8.8: LET b2=5: LET zz=0: GO SUB 4680
4532 FOR j=1 TO 8: FOR i=1 TO 8: IF vf(i,j)=2 THEN LET cc=18: LET a1=i-1: LET b1=j-1: LET a2=i: LET b2=j: LET zz=-0.1: GO SUB 4680: LET nwc=nwc+1: LET wcx(nwc)=i-0.5: LET wcy(nwc)=j-0.5
4534 NEXT i: NEXT j: LET nwa=nq: LET sk=-2: LET wh=3
4540 REM the two back walls, with a doorway wherever there is a room beyond
4545 LET cc=13: LET g=0: LET z1=0: LET z2=wh: IF en2=0 THEN LET a1=0: LET a2=8: GO SUB 4685
4550 IF en2=1 THEN LET a1=0: LET a2=3: GO SUB 4685: LET a1=5: LET a2=8: GO SUB 4685: LET a1=3: LET a2=5: LET z1=2.2: GO SUB 4685: LET cc=14: LET g=3: LET a1=-0.3: LET a2=0: LET z1=0: LET z2=2.2: GO SUB 4690
4555 LET cc=14: LET g=0: LET z1=0: LET z2=wh: IF ew2=0 THEN LET a1=0: LET a2=8: GO SUB 4690
4560 IF ew2=1 THEN LET a1=0: LET a2=3: GO SUB 4690: LET a1=5: LET a2=8: GO SUB 4690: LET a1=3: LET a2=5: LET z1=2.2: GO SUB 4690: LET cc=13: LET g=3: LET a1=-0.3: LET a2=0: LET z1=0: LET z2=2.2: GO SUB 4685
4565 LET cc=13: LET g=8: LET a1=-0.3: LET a2=0: LET z1=0: LET z2=wh: GO SUB 4685: LET cc=14: GO SUB 4690
4566 LET cc=12: LET zz=wh: LET a1=0: LET b1=-0.3: LET a2=8: LET b2=0: GO SUB 4680: LET a1=-0.3: LET b1=-0.3: LET a2=0: LET b2=8: GO SUB 4680
4567 REM where wall meets floor the light cannot reach: shadow along the floor and up the foot of each wall; a lit edge along the tops
4568 LET qtd=2: LET qad=24: LET cc=30: LET zz=0: LET a1=0: LET b1=0: LET a2=8: LET b2=0.45: GO SUB 4680: LET a1=0: LET b1=0: LET a2=0.45: LET b2=8: GO SUB 4680
4569 LET qad=20: LET g=0: LET a1=0: LET a2=8: LET z1=0: LET z2=0.8: GO SUB 4685: GO SUB 4690
4570 LET qtd=1: LET qad=60: LET cc=35: LET np=2: LET u1=0: LET v1=0: LET w1=wh: LET u2=8: LET v2=0: LET w2=wh: GO SUB 4700: LET u2=0: LET v2=8: GO SUB 4700
4572 REM the light comes from the left: each column casts its shadow across the floor to the right
4574 LET sk=-1: LET qtd=2: LET qad=22: LET cc=30: FOR j=0 TO 7: FOR i=0 TO 7: LET h=vh(i+1,j+1): IF h=0 THEN GO TO 4581
4576 LET u1=i+1: LET v1=j: LET u2=i+1+0.5*h: LET v2=j+0.16*h: LET u3=u2: LET v3=v2+1: LET u4=i+0.5*h: LET v4=v3: LET u5=i: LET v5=j+1: LET u6=i: LET v6=j
4577 IF u2>8 THEN LET u2=8: LET u3=8
4578 IF u4>8 THEN LET u4=8
4579 IF v3>8 THEN LET v3=8: LET v4=8
4580 LET w1=0: LET w2=0: LET w3=0: LET w4=0: LET w5=0: LET w6=0: LET np=6: GO SUB 4700
4581 NEXT i: NEXT j
4582 REM and at the foot of each column, on the floor in front of it, a soft band of shadow
4584 LET qad=18: FOR j=0 TO 7: FOR i=0 TO 7: IF vh(i+1,j+1)=0 THEN GO TO 4590
4586 IF j<7 THEN IF vh(i+1,j+2)=0 THEN LET a1=i: LET b1=j+1: LET a2=i+1: LET b2=j+1.4: LET zz=0: GO SUB 4680
4588 IF i<7 THEN IF vh(i+2,j+1)=0 THEN LET a1=i+1: LET b1=j: LET a2=i+1.4: LET b2=j+1: LET zz=0: GO SUB 4680
4590 NEXT i: NEXT j: LET qtd=0: LET qad=100
4592 REM then every column of blocks, a diagonal at a time from the back corner, each bottom to top; only faces that can be seen
4594 FOR s=0 TO 14: FOR i=0 TO 7: LET j=s-i: IF j<0 OR j>7 THEN GO TO 4630
4596 LET sk=s: IF vf(i+1,j+1)=1 THEN GO SUB 4650
4598 LET h=vh(i+1,j+1): IF h=0 THEN GO TO 4630
4600 FOR k=1 TO h: LET t=vt(i+1,j+1,k)
4602 IF k=h THEN LET cc=t*3: LET a1=i: LET b1=j: LET a2=i+1: LET b2=j+1: LET zz=k: GO SUB 4680
4605 IF j=7 OR vh(i+1,j+2)<k THEN LET cc=t*3+1: LET g=j+1: LET a1=i: LET a2=i+1: LET z1=k-1: LET z2=k: GO SUB 4685
4610 IF i=7 OR vh(i+2,j+1)<k THEN LET cc=t*3+2: LET g=i+1: LET a1=j: LET a2=j+1: LET z1=k-1: LET z2=k: GO SUB 4690
4615 NEXT k
4620 REM a bevel of light along the top's two front edges
4622 LET qtd=1: LET qad=70: LET cc=31+t: LET np=3: LET u1=i: LET v1=j+1: LET u2=i+1: LET v2=j+1: LET u3=i+1: LET v3=j: LET w1=h: LET w2=h: LET w3=h: GO SUB 4700: LET qtd=0: LET qad=100
4630 NEXT i: NEXT s: RETURN
4650 REM a bed of spikes: a dark square and four little pyramids, seen as triangles
4652 LET cc=23: LET a1=i: LET b1=j: LET a2=i+1: LET b2=j+1: LET zz=0: GO SUB 4680: LET cc=21
4655 FOR q=0 TO 3: LET gx0=i+0.3+0.4*(q-2*INT (q/2)): LET gy0=j+0.3+0.4*INT (q/2)
4660 LET u1=gx0-0.14: LET v1=gy0+0.14: LET w1=0: LET u2=gx0+0.14: LET v2=gy0-0.14: LET w2=0: LET u3=gx0: LET v3=gy0: LET w3=0.55: LET np=3: GO SUB 4700: NEXT q: RETURN
4680 REM a flat rectangle at height zz, from (a1,b1) to (a2,b2)
4682 LET u1=a1: LET v1=b1: LET u2=a2: LET v2=b1: LET u3=a2: LET v3=b2: LET u4=a1: LET v4=b2: LET w1=zz: LET w2=zz: LET w3=zz: LET w4=zz: LET np=4: GO TO 4700
4685 REM an upright rectangle facing down and left, at y=g, from x=a1 to a2 and height z1 to z2
4687 LET u1=a1: LET u2=a2: LET u3=a2: LET u4=a1: LET v1=g: LET v2=g: LET v3=g: LET v4=g: LET w1=z2: LET w2=z2: LET w3=z1: LET w4=z1: LET np=4: GO TO 4700
4690 REM an upright rectangle facing down and right, at x=g, from y=a1 to a2 and height z1 to z2
4692 LET v1=a1: LET v2=a2: LET v3=a2: LET v4=a1: LET u1=g: LET u2=g: LET u3=g: LET u4=g: LET w1=z2: LET w2=z2: LET w3=z1: LET w4=z1: LET np=4: GO TO 4700
4700 REM keep the face, turned into screen pixels: np corners, colour cc, kind qtd, opacity qad, place sk in the drawing order
4705 LET nq=nq+1: LET qc(nq)=cc: LET qs(nq)=sk: LET qt(nq)=qtd: LET qa(nq)=qad: LET qn(nq)=np
4710 LET qx(nq,1)=ox+(u1-v1)*hw: LET qy(nq,1)=oy+(u1+v1)*hh-w1*bh: LET qx(nq,2)=ox+(u2-v2)*hw: LET qy(nq,2)=oy+(u2+v2)*hh-w2*bh
4712 LET qx(nq,3)=ox+(u3-v3)*hw: LET qy(nq,3)=oy+(u3+v3)*hh-w3*bh: LET qx(nq,4)=ox+(u4-v4)*hw: LET qy(nq,4)=oy+(u4+v4)*hh-w4*bh
4714 IF np>4 THEN LET qx(nq,5)=ox+(u5-v5)*hw: LET qy(nq,5)=oy+(u5+v5)*hh-w5*bh: LET qx(nq,6)=ox+(u6-v6)*hw: LET qy(nq,6)=oy+(u6+v6)*hh-w6*bh
4715 LET qbl(nq)=qx(nq,1): LET qbr(nq)=qbl(nq): LET qbt(nq)=qy(nq,1): LET qbb(nq)=qbt(nq): FOR qq=2 TO np
4716 IF qx(nq,qq)<qbl(nq) THEN LET qbl(nq)=qx(nq,qq)
4717 IF qx(nq,qq)>qbr(nq) THEN LET qbr(nq)=qx(nq,qq)
4718 IF qy(nq,qq)<qbt(nq) THEN LET qbt(nq)=qy(nq,qq)
4719 IF qy(nq,qq)>qbb(nq) THEN LET qbb(nq)=qy(nq,qq)
4720 NEXT qq: RETURN
5100 REM ======================== the end, one way or another ========================
5105 LET msg$="OISIN FALLS. THE ISLE SLEEPS.": GO TO 5160
5150 LET msg$="TWENTY DAYS HAVE PASSED."
5160 LET msgt=1: GO SUB 3500: BORDER 0: TONE -5, 0.3: TONE -9, 0.3: TONE -14, 0.8
5165 FOR k=1 TO 75: PAUSE 1: NEXT k
5170 REPEAT: PAUSE 1: UNTIL KEY " " OR KEY CHR$ 13
5175 REPEAT: PAUSE 1: UNTIL NOT (KEY " " OR KEY CHR$ 13)
5180 FXP "_alpha", 100: FXP "_y", 0: FXP "_xscale", 100: FXP "_x", 0: GO TO 5300
5200 REM the hallows rise from Oisin's hands and circle the altar, and the sky fills with sparks
5205 LET titlemode=2: BORDER 0: SPRITE CLEAR: FOR k=18 TO 21: PRINT AT k,0; "                                ": NEXT k
5210 LET r=18: LET t$="THE FOUR HALLOWS ARE HOME!": LET n=6: GO SUB 3550: LET r=19: LET t$="THE ISLE WAKES FROM ITS SLEEP.": LET n=5: GO SUB 3550
5215 LET r=20: LET t$="IN "+STR$ day+" DAYS OF TWENTY.": LET n=7: GO SUB 3550: LET r=21: LET t$="PRESS SPACE": LET n=4: GO SUB 3550
5220 LET fz=0
5225 FOR k=1 TO 4: LET an=fz/30+k*PI/2: LET ir(k)=9: LET ig(k)=0: LET ix(k)=4+1.6*COS an: LET iy(k)=4+1.6*SIN an: LET iz(k)=2+0.4*SIN (fz/8+k): NEXT k
5230 GO SUB 1200: IF fz-15*INT (fz/15)=0 THEN LET kp=12: LET cnt=12: LET gx=3+RND*2: LET gy=3+RND*2: LET gz=2.5+RND: GO SUB 1095.5: IF fz<200 THEN TONE 7+5*INT (RND*4)
5235 LET ft=ft+1: LET fz=fz+1: LET pose=5: GO TO 2400
5240 PAUSE 1: IF fz<60 OR NOT (KEY " " OR KEY CHR$ 13) THEN GO TO 5225
5245 GO TO 5175
5250 REM ---- setup, the slow part: the ellipse table, the hallows' names, and the figures read from DATA ----
5252 FOR q=1 TO 8: LET an=q*PI/4: LET am=an-PI/8: LET ux(q)=COS am*1.0824: LET uy(q)=SIN am*1.0824: LET vx(q)=COS an: LET vy(q)=SIN an: NEXT q
5254 RESTORE 9500: FOR k=1 TO 4: READ hn$(k): NEXT k: FOR k=1 TO 13: READ zk(k), zs(k), zw(k), zl(k): NEXT k
5256 REM the figures: each part a kind (1 polygon, 2 ellipse, 3 stroke), when it shows (0 always, 1 facing us, 2 facing away,
5257 REM 3 eyes open, 4 eyes shut), outlined or not, colour, opacity, width or radii, then its points, each with its rig
5260 RESTORE 9600: READ nsh: LET np2=0: LET nv=0: FOR s=1 TO nsh: READ n: LET sf(s)=np2+1: FOR j=1 TO n: LET np2=np2+1
5261 READ pk(np2), pf(np2), po(np2), pc(np2), pa(np2), pw(np2), pe(np2), pn(np2): LET ps(np2)=nv+1: FOR w=1 TO pn(np2): LET nv=nv+1: READ gxv(nv), gyv(nv), grv(nv): NEXT w
5262 NEXT j: LET sl(s)=np2: NEXT s
5264 RETURN
5300 REM ======================== title: the shrine at dusk, the hallows circling its altar, fireflies abroad ========================
5305 CLS: BORDER 0: SPRITE CLEAR: GO SUB 4000: LET titlemode=1: LET rm=9: LET rrow=2: LET rcol=2: LET lt=0.62: LET ph=0.3: LET vr=0: GO SUB 3870: LET pk0=99: GO SUB 3700: GO SUB 4500: LET trn=16
5310 LET ft=0: LET pg=-1: LET px=-50: LET py=-50: LET pz=0: FOR k=1 TO 30: LET kl(k)=0: NEXT k
5315 FOR k=1 TO 4: LET an=ft/40+k*PI/2: LET ir(k)=9: LET ig(k)=0: LET ix(k)=4+1.7*COS an: LET iy(k)=4+1.7*SIN an: LET iz(k)=1.4+0.3*SIN (ft/9+k): NEXT k
5318 GO SUB 1200: IF RND<0.25 THEN LET kp=11: LET cnt=1: LET gx=3+RND*2: LET gy=3+RND*2: LET gz=1.5+RND*1.5: GO SUB 1095.5
5320 GO TO 2400
5330 IF INT (ft/110)<>pg THEN LET pg=INT (ft/110): GO SUB 5360
5332 IF KEY "l" THEN LOADER
5335 IF KEY " " OR KEY CHR$ 13 THEN GO TO 5350
5340 LET ft=ft+1: PAUSE 1: GO TO 5315
5350 REPEAT: PAUSE 1: UNTIL NOT (KEY " " OR KEY CHR$ 13)
5355 GO TO 3800
5360 LET w=pg-3*INT (pg/3)
5362 IF w=0 THEN LET a$="THE FOUR HALLOWS": LET b$="OISIN IS HOME FROM TIR NA NOG.": LET c$="BRING THE FOUR HALLOWS TO THE": LET d$="ALTAR BEFORE TWENTY DAYS PASS."
5364 IF w=1 THEN LET a$="ARROWS OR Q A O P TO WALK": LET b$="SPACE OR M TO JUMP": LET c$="T OR ENTER TAKES AND DROPS": LET d$="Z AND X TURN THE VIEW"
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
9510 REM particle presets: kind, spread, lift, life. 1 landing, 2 take-off, 3 running, 4 splash, 5 stars, 6 ant dust,
9511 REM 7 a hallow's sparkle, 8 a find, 9 a firefly, 10 a crate set down, 11 title sparkle, 12 victory burst, 13 a sleepy z
9512 DATA 1,0.06,0.01,14, 1,0.04,0,10, 1,0.015,0.012,12, 2,0.07,0.14,22, 3,0.05,0.03,16, 1,0.01,0.01,10
9513 DATA 4,0.006,0.02,22, 4,0.09,0.05,24, 5,0.012,0,220, 1,0.05,0.01,14, 4,0.01,0.02,22, 4,0.1,0.04,24, 6,0.004,0.015,40
9600 REM ======================== the figures, in pixels from the feet (up is minus), drawn back to front ========================
9601 REM each part: kind, shows, outlined, colour, opacity, width or x radius, y radius, points; then x, y, rig for each point
9602 REM rigs: 0 still, 1 and 2 the feet, 3 the head, 4 the hem, 5 hair and antennae, 6 and 7 the hands, 8 the eyes
9603 DATA 8
9604 REM ---- 1 Oisin: cloak, far leg and arm, tunic with shade and light, belt, near leg and arm, head from the front, back or side, fair hair, eyes that blink and look ----
9605 DATA 39
9606 DATA 1,0,1,1924654,100,0,0,5, -5,-17,0, 5,-17,0, 7.5,-3,4, 0,-1.5,4, -7.5,-3,4
9607 DATA 3,0,0,3810838,100,2.6,0,2, 1.8,-7,0, 2,-0.6,2
9608 DATA 2,0,0,4860436,100,2.3,1.3,1, 2.6,-0.7,2
9609 DATA 3,0,0,2253875,100,2.4,0,2, 3.8,-15.5,0, 5.4,-9.6,7
9610 DATA 2,0,0,14725248,100,1.3,1.3,1, 5.5,-9.1,7
9611 DATA 1,0,1,3116870,100,0,0,4, -5,-6.5,4, 5,-6.5,4, 4,-17,0, -4,-17,0
9612 DATA 1,0,0,2322488,100,0,0,4, 1.2,-6.5,4, 5,-6.5,4, 4,-17,0, 1.6,-17,0
9613 DATA 1,0,0,5224552,100,0,0,4, -5,-6.5,4, -3.6,-6.5,4, -2.8,-16.6,0, -4,-17,0
9614 DATA 3,0,0,4862496,100,2.6,0,2, -1.8,-7,0, -2,-0.6,1
9615 DATA 2,0,1,5911064,100,2.3,1.3,1, -1.4,-0.7,1
9616 DATA 1,0,1,14198832,100,0,0,4, -5.2,-10,0, 5.2,-10,0, 5,-11.6,0, -5,-11.6,0
9617 DATA 1,0,0,16773280,100,0,0,4, -0.8,-10.2,0, 0.8,-10.2,0, 0.8,-11.4,0, -0.8,-11.4,0
9618 DATA 1,0,1,1924654,100,0,0,4, -4.6,-17.6,0, 4.6,-17.6,0, 2.6,-15.8,0, -2.6,-15.8,0
9619 DATA 2,0,0,15253568,100,1,1,1, -2.2,-16.8,0
9620 DATA 3,0,0,3116870,100,2.4,0,2, -3.8,-15.5,0, -5.4,-9.6,6
9621 DATA 2,0,1,15777936,100,1.3,1.3,1, -5.5,-9.1,6
9622 DATA 2,1,1,15777936,100,4.2,4.4,1, 0,-21.6,3
9623 DATA 2,2,1,14721056,100,4.3,4.6,1, 0,-21.9,3
9624 DATA 1,1,1,14721056,100,0,0,8, -4.4,-21.6,3, -4.7,-25,3, -2,-27.3,5, 2,-27.5,5, 4.7,-25,3, 4.4,-21.6,3, 2.6,-23.9,3, -2.6,-23.9,3
9625 DATA 1,2,1,13142552,100,0,0,4, -2.4,-20,3, 2.4,-20,3, 1.4,-14.5,5, -1.4,-14.5,5
9626 DATA 2,5,1,15777936,100,4,4.3,1, 0.3,-21.6,3
9627 DATA 1,5,1,14721056,100,0,0,7, 3.8,-23.6,3, 2.6,-26.6,3, -1.5,-27.4,3, -4.4,-24.5,3, -4.6,-20.5,3, -3.4,-18.6,5, -1.2,-22.4,3
9628 DATA 1,5,1,13142552,100,0,0,4, -3.6,-20,3, -1.8,-19.6,3, -2.8,-14.8,5, -4.4,-15.2,5
9629 DATA 2,5,0,14723192,100,0.9,1.2,1, -0.6,-21.2,3
9630 DATA 2,5,0,15249536,100,0.8,0.7,1, 4.1,-21,3
9631 DATA 2,7,0,1708064,100,0.6,1.1,1, 2.5,-21.4,8
9632 DATA 2,7,0,16777215,100,0.28,0.28,1, 2.65,-21.8,8
9633 DATA 3,8,0,1708064,100,0.8,0,2, 1.9,-21.2,3, 3.1,-21.2,3
9634 DATA 3,5,0,9058858,100,0.8,0,2, 2.6,-19,3, 3.5,-19.1,3
9635 DATA 2,5,0,16743024,40,0.9,0.5,1, 2.2,-19.8,3
9636 DATA 2,0,0,16773296,65,1.5,0.6,1, -1.4,-25.9,3
9637 DATA 2,3,0,1708064,100,0.75,1.15,1, -1.1,-21.2,8
9638 DATA 2,3,0,1708064,100,0.75,1.15,1, 2.1,-21.2,8
9639 DATA 2,3,0,16777215,100,0.32,0.32,1, -0.85,-21.6,8
9640 DATA 2,3,0,16777215,100,0.32,0.32,1, 2.35,-21.6,8
9641 DATA 2,1,0,16743024,40,1.1,0.6,1, 3.1,-19.7,3
9642 DATA 3,1,0,9058858,100,0.8,0,2, 0.5,-18.8,3, 1.6,-19,3
9643 DATA 3,4,0,1708064,100,0.8,0,2, -1.8,-21,3, -0.4,-21,3
9644 DATA 3,4,0,1708064,100,0.8,0,2, 1.4,-21,3, 2.8,-21,3
9645 REM ---- 2 a giant ant: far legs and antenna, abdomen, waist, thorax, head with a glint, mandibles, near legs ----
9646 DATA 19
9647 DATA 3,0,0,2363402,100,1.3,0,3, -1,-5,0, -3.2,-7.6,0, -5.2,0,2
9648 DATA 3,0,0,2363402,100,1.3,0,3, 0.6,-5,0, 0.8,-8,0, 1.8,0,1
9649 DATA 3,0,0,2363402,100,1.3,0,3, 2,-5,0, 4.2,-7.6,0, 6.2,0,2
9650 DATA 3,0,0,2363402,100,0.8,0,3, 5.4,-10,3, 6.4,-14,5, 9.4,-14.6,5
9651 DATA 2,0,1,9055252,100,5.6,4.2,1, -7,-6.6,3
9652 DATA 3,0,0,5904906,90,0.9,0,2, -8.6,-10.2,3, -8.6,-3,3
9653 DATA 2,0,0,14708816,65,2.6,1.2,1, -8.2,-8.6,3
9654 DATA 2,0,1,5905934,100,1.5,1.2,1, -2.6,-5.7,0
9655 DATA 2,0,1,8004626,100,3.2,2.7,1, 0.5,-6.3,0
9656 DATA 2,0,0,13656128,55,1.3,0.7,1, 0,-8,0
9657 DATA 2,0,1,9055252,100,3.7,3.1,1, 6,-7.3,3
9658 DATA 2,0,0,14708816,60,1.5,0.8,1, 5.3,-9.2,3
9659 DATA 2,0,0,1052688,100,1.15,1.15,1, 7.4,-8,3
9660 DATA 2,0,0,16777215,100,0.4,0.4,1, 7.7,-8.4,3
9661 DATA 3,0,0,2363402,100,1.2,0,3, 8.8,-6.2,3, 10.8,-5,3, 9.9,-3.6,3
9662 DATA 3,0,0,2363402,100,1,0,3, 6.6,-10.1,3, 8.6,-13.6,5, 11.6,-13.2,5
9663 DATA 3,0,0,3807248,100,1.6,0,3, -1.4,-5,0, -4,-7.2,0, -6.6,0,1
9664 DATA 3,0,0,3807248,100,1.6,0,3, 0.2,-5,0, -0.4,-8,0, -0.8,0,2
9665 DATA 3,0,0,3807248,100,1.6,0,3, 1.8,-5,0, 4.6,-7.2,0, 7.6,0,1
9666 REM ---- 3 a wraith: wisps, far arm, a ragged body with a glow inside, near arm, eyes with a light in them ----
9667 DATA 11
9668 DATA 1,0,0,13162751,45,0,0,5, -5,-6,0, -9,-2,4, -11.5,3,5, -7,1,4, -4,-2,0
9669 DATA 1,0,0,13162751,45,0,0,5, 5,-6,0, 9,-2,4, 11.5,3,5, 7,1,4, 4,-2,0
9670 DATA 3,0,0,13688063,80,2.2,0,2, 5.5,-11,0, 8.8,-14.6,6
9671 DATA 1,0,1,15002879,82,0,0,12, -6,-2,4, -6.2,-13,0, -4.6,-19,0, 0,-21.2,0, 4.6,-19,0, 6.2,-13,0, 6,-2,4, 4,1.2,5, 2,-2,4, 0,1.2,5, -2,-2,4, -4,1.2,5
9672 DATA 2,0,0,16777215,45,3.4,5,1, -0.6,-13,0
9673 DATA 3,0,0,15791871,90,2.2,0,2, -5.5,-11,0, -8.8,-14.6,6
9674 DATA 2,3,0,1052720,100,1.3,2,1, -2.2,-14.6,0
9675 DATA 2,3,0,1052720,100,1.3,2,1, 2.2,-14.6,0
9676 DATA 2,3,0,8438015,90,0.45,0.45,1, -2,-15.2,0
9677 DATA 2,3,0,8438015,90,0.45,0.45,1, 2.4,-15.2,0
9678 DATA 2,0,0,1052720,70,1,1.5,1, 0,-9.6,0
9679 REM ---- 4 the Stone of Fal, with a rune that glows ----
9680 DATA 4
9681 DATA 1,0,1,14737642,100,0,0,4, 0,-17,0, 6,-14,0, 0,-11,0, -6,-14,0
9682 DATA 1,0,1,10526900,100,0,0,4, -6,-14,0, 0,-11,0, 0,-4,0, -6,-7,0
9683 DATA 1,0,1,7237250,100,0,0,4, 0,-11,0, 6,-14,0, 6,-7,0, 0,-4,0
9684 DATA 3,0,0,8450303,90,1,0,4, -4.5,-11,0, -2.5,-9,0, -4.5,-7.5,0, -2,-6,0
9685 REM ---- 5 the Spear of Lugh ----
9686 DATA 4
9687 DATA 3,0,0,9067050,100,2,0,2, -6,-1,0, 5,-18,0
9688 DATA 3,0,0,14198832,100,2.6,0,2, -2.5,-6.5,0, -1,-9,0
9689 DATA 1,0,1,15781984,100,0,0,4, 3,-16.5,0, 6,-20,0, 9.5,-27,0, 7.5,-15.5,0
9690 DATA 3,0,0,16776160,90,0.8,0,2, 5.2,-19,0, 8.2,-25,0
9691 REM ---- 6 the Sword of Nuada ----
9692 DATA 6
9693 DATA 1,0,1,15265528,100,0,0,5, -1.4,-7,0, 1.4,-7,0, 1.4,-22,0, 0,-25.5,0, -1.4,-22,0
9694 DATA 3,0,0,11057360,100,0.8,0,2, 0,-8,0, 0,-21.5,0
9695 DATA 1,0,1,15777856,100,0,0,4, -5,-8.5,0, 5,-8.5,0, 5,-6.5,0, -5,-6.5,0
9696 DATA 3,0,0,6961690,100,2,0,2, 0,-6.5,0, 0,-2.5,0
9697 DATA 2,0,1,15777856,100,1.7,1.7,1, 0,-1.8,0
9698 DATA 2,0,0,16724048,100,0.8,0.8,1, 0,-7.5,0
9699 REM ---- 7 the Cauldron of the Dagda, brimming and bubbling ----
9700 DATA 8
9701 DATA 3,0,0,2105376,100,1.6,0,2, -5,-3,0, -6,0,0
9702 DATA 3,0,0,2105376,100,1.6,0,2, 5,-3,0, 6,0,0
9703 DATA 1,0,1,2763310,100,0,0,9, -7.5,-12,0, -8,-8,0, -6.8,-4,0, -4,-2,0, 0,-1.4,0, 4,-2,0, 6.8,-4,0, 8,-8,0, 7.5,-12,0
9704 DATA 3,0,0,6974072,90,1.2,0,3, -6,-10,0, -5.6,-7,0, -4.2,-4.6,0
9705 DATA 2,0,1,15777856,100,7.8,2.6,1, 0,-12,0
9706 DATA 2,0,0,6353040,85,6,1.7,1, 0,-12.2,0
9707 DATA 2,0,0,12648400,90,1,0.7,1, -2,-13,4
9708 DATA 2,0,0,12648400,90,0.8,0.6,1, 2.5,-12.8,4
9709 REM ---- 8 a healing herb: stem, three leaves and a berry ----
9710 DATA 6
9711 DATA 3,0,0,2783792,100,1.2,0,2, 0,0,0, 0.5,-9,4
9712 DATA 1,0,1,3979344,100,0,0,3, 0,-3,0, -6.5,-5.5,4, -1,-6.5,4
9713 DATA 1,0,1,4769888,100,0,0,3, 0,-4,0, 6.5,-6.5,4, 1,-7.5,4
9714 DATA 1,0,1,3979344,100,0,0,4, 0.5,-7,4, -1.5,-10,4, 0.5,-13,4, 2.5,-10,4
9715 DATA 2,0,1,14692400,100,1.4,1.4,1, 2.5,-11.5,4
9716 DATA 2,0,0,16761024,100,0.4,0.4,1, 2.2,-11.9,4
