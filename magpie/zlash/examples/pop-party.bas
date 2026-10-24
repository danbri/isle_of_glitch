5 REM touch: m=MUSIC l=LOADER
10 REM ======================== POP PARTY ========================
20 REM A Flash-style party game made from emoji, in plain BASIC.
30 REM Click, or hold the button and swipe, to pop things as they float up.
40 REM Popped sweets fall: Percy the pelican pedals after them and catches them in his pouch.
50 REM A star's shockwave pops its neighbours, a clock gives five more seconds, a bomb costs a heart.
60 REM Five quick pops start a FEVER. With 15 seconds left a pinata arrives: whack it eight times.
65 REM The sky turns to sunset as time runs out, a canary drops by now and then, and your best score is kept.
70 REM
80 REM   100 setup            300 title screen       500 a new round
90 REM   600 the game loop    800 results           1000 popping
92 REM  1100 bursts of bits  1150 pop-up words      1200 bits and words move
93 REM  1300 floating things 1500 launch one        1600 the canary
94 REM  1700 the pinata      1800 falling sweets    2000 sun, stars, clouds
96 REM  2500 pointer, keys   2600 the swipe trail   2700 hearts, time bar
97 REM  2800 the music       3000 scenery           3200 the sky        4000 Percy the pelican
98 REM  Every loop ends with HALT: wait for the next frame, so it all runs 50 times a second.  L: loader  M: music
100 REM ======================== setup ========================
110 REM EMOJI turns an emoji into a bitmap when the program is compiled; SPRITE stamps copies of it
120 EMOJI "🎈","balloon",48: EMOJI "🍬","candy",40: EMOJI "🌟","star",44: EMOJI "💣","bomb",44: EMOJI "⏰","clock",40
130 EMOJI "🎉","confetti",28: EMOJI "✨","sparkle",24: EMOJI "💥","boom",48: EMOJI "☁️","cloud",64: EMOJI "🌞","sun",56
140 EMOJI "❤️","heart",24: EMOJI "🎯","aim",28: EMOJI "🟩","timebar",16: EMOJI "🟥","hurry",16: EMOJI "⭐","twinkle",20
145 EMOJI "🐤","canary",40: EMOJI "🪶","feather",24: EMOJI "🪅","pinata",96
150 REM ...and plain words come out as chunky cartoon lettering
160 EMOJI "POP PARTY","title",256: EMOJI "TIME UP!","timeup",192: EMOJI "KABOOM!","gameover",192: EMOJI "FEVER!","fever",160: EMOJI "WHACK IT!","whackit",160
170 EMOJI "+10","plus10",48: EMOJI "+20","plus20",48: EMOJI "+50","plus50",48: EMOJI "+5 SEC","plus5",64: EMOJI "OUCH!","ouch",64
180 EMOJI "x2","x2",40: EMOJI "x3","x3",40: EMOJI "x4","x4",40: EMOJI "x5","x5",40: EMOJI "GULP!","gulp",64: EMOJI "TWEET!","tweet",64: EMOJI "+200","plus200",64
190 BORDER #1d2b53: PAPER #3a7bd5: INK 7: BRIGHT 1: CLS
200 REM the five kinds of thing: looks, points, size (percent), rising speed (pixels a frame), sway (pixels)
210 LET kinds=5: DIM look$(kinds): DIM points(kinds): DIM size(kinds): DIM speed(kinds): DIM sway(kinds)
220 RESTORE 290: FOR k=1 TO kinds: READ look$(k),points(k),size(k),speed(k),sway(k): NEXT k
230 REM up to ten floating things at once; each one has a slot in these arrays
240 LET most=10: DIM kind(most): DIM alive(most): DIM homex(most): DIM screenx(most): DIM y(most): DIM rise(most): DIM age(most): DIM phase(most): DIM scale(most)
250 REM little bits for bursts, words that pop up, the points of the swipe trail, and falling sweets
260 LET bits=36: DIM bit$(bits): DIM bitx(bits): DIM bity(bits): DIM bitdx(bits): DIM bitdy(bits): DIM bitlife(bits): DIM bitsize(bits): DIM bitspin(bits)
265 LET labels=8: DIM label$(labels): DIM labelx(labels): DIM labely(labels): DIM labellife(labels)
270 LET trail=10: DIM trailx(trail): DIM traily(trail): LET trailsize=0
275 LET drops=8: DIM dropalive(drops): DIM dropx(drops): DIM dropy(drops): DIM dropdx(drops): DIM dropdy(drops)
280 LET clouds=4: DIM cloudx(clouds): DIM cloudy(clouds): DIM cloudsize(clouds): FOR c=1 TO clouds: LET cloudx(c)=RND*300-30: LET cloudy(c)=14+RND*50: LET cloudsize(c)=60+RND*70: NEXT c
282 LET nightstars=10: DIM nightx(nightstars): DIM nighty(nightstars): FOR c=1 TO nightstars: LET nightx(c)=RND*256: LET nighty(c)=10+RND*80: NEXT c
284 REM KEPT reads back a number saved by KEEP on an earlier visit (0 the first time)
285 LET best=KEPT "popparty.best": LET cyclex=-40: LET pace=0.35: LET shake=0: LET ringlife=0: LET music=1: LET beat=0: LET note=0: LET wasm=0
287 LET fever=0: LET gulp=0: LET dusk=0: LET playing=0: LET canaryalive=0: LET canaryhit=0: LET bossalive=0: LET bossdone=0: LET bossflinch=0
290 DATA "balloon",10,110,0.5,9, "candy",20,80,0.65,9, "star",50,85,0.85,28, "bomb",0,105,0.45,5, "clock",0,90,0.5,9
300 REM ======================== title screen ========================
310 LET frame=0: LET wasdown=1: LET dusk=0: LET playing=0
320 FOR b=1 TO most: LET alive(b)=0: NEXT b
330 CLS: PRINT AT 21,1; INK 0; "L: LOADER   M: MUSIC"
340 REPEAT
350 SPRITE CLEAR: LET frame=frame+1: GO SUB 3000: GO SUB 2000: GO SUB 2800
360 IF frame-INT (frame/70)*70=1 THEN GO SUB 1500
365 IF canaryalive=0 AND RND<0.003 THEN GO SUB 1650
370 GO SUB 1300: GO SUB 1600: GO SUB 1200
380 REM the title drops in on a spring: 1 - e^(-t)*cos(t) overshoots, then settles
390 LET spring=1-EXP (-frame/18)*COS (frame/8)
400 SPRITE "title", 128, 100*spring-40, 100+5*SIN (frame/22), 100-5*SIN (frame/22), 3*SIN (frame/34), 100
410 IF frame>60 AND INT (frame/50)=2*INT (frame/100) THEN PRINT AT 12,4; INK 0; "CLICK OR SWIPE TO START"
420 IF frame>60 AND INT (frame/50)<>2*INT (frame/100) THEN PRINT AT 12,4; "                       "
430 IF best>0 THEN PRINT AT 14,11; INK 0; "BEST "; best
440 GO SUB 2500: HALT
450 UNTIL clicked OR startkey
500 REM ======================== a new round ========================
505 REM time the round with TICKS, the real clock (50 a second), rather than counting passes round the loop
510 LET score=0: LET hearts=3: LET endtick=TICKS+60*50: LET timeleft=60*50: LET combo=0: LET lastpop=-99: LET every=60: LET frame=0
515 LET fever=0: LET gulp=0: LET bossdone=0: LET bossalive=0: LET playing=1
520 CLS: PRINT AT 0,1; INK 7; "SCORE 0": PRINT AT 21,1; INK 0; "L: LOADER   M: MUSIC"
530 FOR b=1 TO most: LET alive(b)=0: NEXT b: FOR d=1 TO drops: LET dropalive(d)=0: NEXT d
600 REM ======================== the game loop: once per frame, 50 times a second ========================
610 REPEAT
620 SPRITE CLEAR: LET frame=frame+1: LET timeleft=endtick-TICKS: IF fever>0 THEN LET fever=fever-1
630 GO SUB 3000: GO SUB 2000: GO SUB 2800
640 REM new things come more often as the round goes on; now and then a canary; the pinata with 15 seconds to go
650 IF frame-INT (frame/every)*every=0 THEN GO SUB 1500
660 IF frame-INT (frame/300)*300=0 AND every>24 THEN LET every=every-6
665 IF canaryalive=0 AND RND<0.003 THEN GO SUB 1650
667 IF bossdone=0 AND timeleft<=15*50 THEN GO SUB 1750
670 GO SUB 2500
680 IF down THEN GO SUB 1000
690 GO SUB 1300: GO SUB 1700: GO SUB 1800: GO SUB 1600: GO SUB 1200: GO SUB 2700
700 HALT
710 UNTIL timeleft<=0 OR hearts<=0
800 REM ======================== results ========================
810 LET playing=0: LET fever=0: LET newbest=0: IF score>best THEN LET best=score: LET newbest=1: KEEP "popparty.best", best
820 LET banner$="timeup": IF hearts<=0 THEN LET banner$="gameover"
830 LET t=0: LET wasdown=1
840 REPEAT
850 SPRITE CLEAR: LET t=t+1: LET frame=frame+1: GO SUB 3000: GO SUB 2000: GO SUB 2800: GO SUB 1300: GO SUB 1700: GO SUB 1800: GO SUB 1600: GO SUB 1200
860 IF newbest AND t-INT (t/12)*12=0 THEN LET burstx=RND*256: LET bursty=20: LET many=2: LET newbit$="confetti": GO SUB 1100
870 LET spring=1-EXP (-t/14)*COS (t/6)
880 SPRITE banner$, 128, 52, 110*spring, 110*spring, 4*SIN (t/26), 100
890 IF t=50 THEN PRINT AT 11,10; INK 0; "SCORE "; score: PRINT AT 12,10; INK 0; "BEST  "; best
900 IF t=50 AND newbest THEN PRINT AT 13,10; INK 2; "NEW BEST!"
910 IF t>80 THEN PRINT AT 15,6; INK 0; "CLICK TO PLAY AGAIN"
920 GO SUB 2500: HALT
930 UNTIL t>80 AND (clicked OR startkey)
940 GO TO 500
1000 REM ======================== popping: whatever is under the pointer while the button is down ========================
1005 REM the canary and the pinata come first: they are in front of everything
1010 IF canaryalive AND canaryhit=0 AND ABS (aimx-canaryx)<14 AND ABS (aimy-canaryy)<12 THEN GO SUB 1680: RETURN
1015 IF bossalive AND bossflinch=0 AND ABS (aimx-bossx)<30 AND ABS (aimy-bossy)<32 THEN GO SUB 1780: RETURN
1018 REM holding the button and sweeping pops everything you pass through; later things are drawn on top, so look from the last
1020 LET hit=0: FOR b=most TO 1 STEP -1
1030 IF alive(b) AND hit=0 THEN IF ABS (aimx-screenx(b))<scale(b)/4.5 AND ABS (aimy-y(b))<scale(b)/4.5 THEN LET hit=b
1040 NEXT b
1045 IF hit=0 THEN IF clicked THEN LET combo=0
1048 IF hit=0 THEN RETURN
1049 LET b=hit
1050 REM ---- pop thing number b ----
1052 LET alive(b)=0: LET burstx=screenx(b): LET bursty=y(b)
1054 IF look$(kind(b))="bomb" THEN LET hearts=hearts-1: LET shake=28: LET combo=0: LET newbit$="boom": LET many=6: GO SUB 1100: LET newlabel$="ouch": GO SUB 1150: TONE -12: RETURN
1060 REM pops close together build a combo, which multiplies the points (up to five times; twice that in a FEVER)
1062 IF frame-lastpop<70 THEN LET combo=combo+1 ELSE LET combo=1
1064 LET lastpop=frame: LET times=combo: IF times>5 THEN LET times=5
1066 LET score=score+points(kind(b))*times*(1+(fever>0)): PRINT AT 0,1; INK 7; "SCORE "; score
1068 IF look$(kind(b))="clock" THEN LET endtick=endtick+250: LET newlabel$="plus5" ELSE LET newlabel$="plus"+STR$ points(kind(b))
1070 REM a star sends out a ring that pops everything it reaches (see 1385); a sweet falls, for Percy (see 1800)
1072 IF look$(kind(b))="star" THEN LET ringx=burstx: LET ringy=bursty: LET ringr=4: LET ringlife=30: LET shake=8
1073 IF look$(kind(b))="candy" THEN GO SUB 1850
1074 LET newbit$="confetti": LET many=5: GO SUB 1100: LET newbit$="sparkle": LET many=3: GO SUB 1100: GO SUB 1150
1076 IF times>1 THEN LET newlabel$="x"+STR$ times: LET bursty=bursty-14: GO SUB 1150
1077 IF combo=5 AND fever=0 THEN LET fever=300: LET burstx=128: LET bursty=88: LET newlabel$="fever": GO SUB 1150: TONE 24
1078 TONE 4+3*times: RETURN
1100 REM ======================== a burst: "many" bits called newbit$ fly out of (burstx, bursty) ========================
1110 FOR i=1 TO bits
1120 IF many>0 AND bitlife(i)<=0 THEN LET many=many-1: LET angle=RND*2*PI: LET push=0.5+RND*1.3: LET bit$(i)=newbit$: LET bitx(i)=burstx: LET bity(i)=bursty: LET bitdx(i)=push*COS angle: LET bitdy(i)=push*SIN angle-0.8: LET bitlife(i)=48+RND*28: LET bitsize(i)=50+RND*60: LET bitspin(i)=(RND-0.5)*15
1130 NEXT i: RETURN
1150 REM ======================== a word (newlabel$) pops up at (burstx, bursty) ========================
1160 FOR i=1 TO labels: IF labellife(i)<=0 THEN LET label$(i)=newlabel$: LET labelx(i)=burstx: LET labely(i)=bursty: LET labellife(i)=80: LET i=labels
1170 NEXT i: RETURN
1200 REM ======================== bits fall, spin and fade; words spring up and drift away ========================
1210 FOR i=1 TO bits: IF bitlife(i)>0 THEN LET bitlife(i)=bitlife(i)-1: LET bitx(i)=bitx(i)+bitdx(i): LET bity(i)=bity(i)+bitdy(i): LET bitdy(i)=bitdy(i)+0.03: SPRITE bit$(i), bitx(i)+shakex, bity(i)+shakey, bitsize(i), bitsize(i), bitspin(i)*bitlife(i), 1.5*bitlife(i)
1220 NEXT i
1230 FOR i=1 TO labels: IF labellife(i)>0 THEN LET labellife(i)=labellife(i)-1: LET labely(i)=labely(i)-0.35: LET grow=80-labellife(i): LET spring=1-EXP (-grow/8)*COS (grow/4): SPRITE label$(i), labelx(i), labely(i), 60*spring, 60*spring, 0, 4*labellife(i)
1240 NEXT i: RETURN
1300 REM ======================== everything floating rises, sways on a sine wave and wobbles ========================
1305 IF ringlife>0 THEN LET ringlife=ringlife-1: LET ringr=ringr+3
1310 FOR b=1 TO most: IF alive(b) THEN GO SUB 1330
1320 NEXT b: RETURN
1330 LET age(b)=age(b)+1: LET y(b)=y(b)-rise(b)
1340 LET screenx(b)=homex(b)+sway(kind(b))*SIN (frame/44+phase(b))
1350 REM it arrives on a spring, then squashes and stretches a little, out of step with its neighbours
1360 LET spring=1-EXP (-age(b)/10)*COS (age(b)/5): LET wobble=0.04*SIN (frame/14+phase(b))
1370 SPRITE look$(kind(b)), screenx(b)+shakex, y(b)+shakey, scale(b)*spring*(1+wobble), scale(b)*spring*(1-wobble), 8*COS (frame/44+phase(b)), 100
1380 IF y(b)<-30 THEN LET alive(b)=0
1385 REM a star's shockwave pops everything inside the ring, except bombs: a chain reaction
1390 IF playing AND ringlife>0 AND alive(b) AND look$(kind(b))<>"bomb" THEN LET dx=screenx(b)-ringx: LET dy=y(b)-ringy: IF dx*dx+dy*dy<ringr*ringr THEN GO SUB 1050
1395 RETURN
1500 REM ======================== launch something new from below the screen ========================
1510 LET b=0: FOR i=1 TO most: IF alive(i)=0 THEN LET b=i: LET i=most
1520 NEXT i: IF b=0 THEN RETURN
1530 REM roll a dice: mostly balloons and sweets; bombs get commoner as the round goes on
1540 LET roll=RND: LET late=frame/3000
1550 LET k=1: IF roll<0.45 THEN LET k=2
1560 IF roll<0.25+0.12*late THEN LET k=4
1570 IF roll<0.12 THEN LET k=5
1580 IF roll<0.07 THEN LET k=3
1590 LET kind(b)=k: LET alive(b)=1: LET age(b)=0: LET phase(b)=RND*2*PI: LET homex(b)=24+RND*208: LET screenx(b)=homex(b): LET y(b)=196
1595 LET scale(b)=size(k)*(0.9+RND*0.25): LET rise(b)=speed(k)*(0.6+RND*0.4+late*0.5): RETURN
1600 REM ======================== a canary flies past; flapping is just squashing the sprite up and down ========================
1610 IF canaryalive=0 THEN RETURN
1620 LET canaryx=canaryx+canarydir*(0.8+canaryhit*1.2): LET canaryy=canaryy+0.4*SIN (frame/12)-canaryhit*0.7
1630 REM a negative width flips the picture, so the bird can face either way
1640 SPRITE "canary", canaryx+shakex, canaryy+shakey, -canarydir*90, 90*(0.85+0.15*SIN (frame/2)), 6*SIN (frame/12), 100
1645 IF canaryx<-30 OR canaryx>286 OR canaryy<-30 THEN LET canaryalive=0
1648 RETURN
1650 REM ---- a canary sets off from one side or the other ----
1660 LET canaryalive=1: LET canaryhit=0: LET canarydir=1: LET canaryx=-24: IF RND<0.5 THEN LET canarydir=-1: LET canaryx=280
1670 LET canaryy=30+RND*60: TONE 22: RETURN
1680 REM ---- touching the canary: a tweet, a feather or two, and off it flutters, upwards ----
1690 LET canaryhit=1: LET score=score+25: PRINT AT 0,1; INK 7; "SCORE "; score: LET burstx=canaryx: LET bursty=canaryy: LET newbit$="feather": LET many=3: GO SUB 1100: LET newlabel$="tweet": GO SUB 1150: TONE 24: TONE 19: RETURN
1700 REM ======================== the pinata floats up, hovers, and takes eight whacks ========================
1710 IF bossalive=0 THEN RETURN
1720 IF bossy>72 THEN LET bossy=bossy-0.6
1725 IF bossflinch>0 THEN LET bossflinch=bossflinch-1
1730 LET bossx=128+60*SIN (frame/90): LET squash=bossflinch*3
1740 SPRITE "pinata", bossx+shakex+(RND-0.5)*bossflinch, bossy+shakey, 120+squash, 120-squash, 10*SIN (frame/40)+bossflinch*2, 100: RETURN
1750 REM ---- the pinata arrives, once a round ----
1760 LET bossdone=1: LET bossalive=1: LET bosshp=8: LET bossx=128: LET bossy=210: LET bossflinch=0: LET burstx=128: LET bursty=60: LET newlabel$="whackit": GO SUB 1150: TONE 0: RETURN
1780 REM ---- a whack: it flinches; on the last one it bursts, with a shockwave and a shower of sweets ----
1790 LET bosshp=bosshp-1: LET bossflinch=10: LET shake=6: LET burstx=bossx: LET bursty=bossy: LET newbit$="sparkle": LET many=4: GO SUB 1100: TONE 2+bosshp: IF bosshp>0 THEN RETURN
1792 LET bossalive=0: LET score=score+200: PRINT AT 0,1; INK 7; "SCORE "; score: LET shake=20
1794 LET newbit$="confetti": LET many=12: GO SUB 1100: LET newlabel$="plus200": GO SUB 1150: LET ringx=bossx: LET ringy=bossy: LET ringr=10: LET ringlife=30
1796 FOR k=1 TO 6: LET burstx=bossx+(k-3.5)*10: GO SUB 1850: NEXT k
1798 TONE 24: TONE 12: RETURN
1800 REM ======================== falling sweets: Percy catches them in his pouch ========================
1810 FOR d=1 TO drops: IF dropalive(d) THEN GO SUB 1830
1820 NEXT d: RETURN
1830 LET dropdy(d)=dropdy(d)+0.05: LET dropx(d)=dropx(d)+dropdx(d): LET dropy(d)=dropy(d)+dropdy(d)
1835 SPRITE "candy", dropx(d)+shakex, dropy(d)+shakey, 60, 60, frame*4, 100
1840 REM his beak is about 18 pixels ahead of him, at the height of his head
1842 IF playing AND ABS (dropx(d)-(cyclex+18))<11 AND ABS (dropy(d)-123)<9 THEN LET dropalive(d)=0: LET gulp=40: LET score=score+30: PRINT AT 0,1; INK 7; "SCORE "; score: LET burstx=cyclex+18: LET bursty=110: LET newlabel$="gulp": GO SUB 1150: TONE 9: TONE 16: RETURN
1845 IF dropy(d)>176 THEN LET dropalive(d)=0
1848 RETURN
1850 REM ---- a sweet starts to fall from (burstx, bursty), with a little hop ----
1860 FOR d=1 TO drops: IF dropalive(d)=0 THEN LET dropalive(d)=1: LET dropx(d)=burstx: LET dropy(d)=bursty: LET dropdy(d)=-1: LET dropdx(d)=(RND-0.5)*1.2: LET d=drops
1870 NEXT d: RETURN
2000 REM ======================== the sun turns and sinks, stars come out at dusk, and nearer clouds drift faster ========================
2010 SPRITE "sun", 226+shakex, 24+dusk*90+shakey, 100+5*SIN (frame/28), 100+5*SIN (frame/28), frame/8, 100-dusk*70
2015 IF dusk>0.55 THEN FOR c=1 TO nightstars: SPRITE "twinkle", nightx(c)+shakex, nighty(c)+shakey, 60, 60, 0, (dusk-0.55)*220*(0.6+0.4*SIN (frame/9+c)): NEXT c
2020 FOR c=1 TO clouds: LET cloudx(c)=cloudx(c)+cloudsize(c)/1000: IF cloudx(c)>290 THEN LET cloudx(c)=-34: LET cloudy(c)=14+RND*50
2030 SPRITE "cloud", cloudx(c)+shakex, cloudy(c)+shakey, cloudsize(c), cloudsize(c)*0.8, 0, 90: NEXT c: RETURN
2500 REM ======================== the pointer, and the keys ========================
2510 REM MOUSEY counts up from the bottom of the screen; sprites count down from the top
2520 LET aimx=MOUSEX: LET aimy=175-MOUSEY
2530 REM a click is the moment the button goes down; "down" stays true while it is held
2540 LET down=MOUSEB: LET clicked=down AND NOT wasdown: LET wasdown=down
2550 IF aimx>=0 AND aimx<256 AND aimy>=0 AND aimy<176 THEN SPRITE "aim", aimx, aimy, 70, 70, frame*1.5, 80
2560 LET key$=INKEY$: LET startkey=(key$=" " OR key$=CHR$ 13)
2570 IF key$="l" OR key$="L" THEN LOADER
2580 IF (key$="m" OR key$="M") AND NOT wasm THEN LET music=1-music
2585 LET wasm=(key$="m" OR key$="M")
2590 REM remember where the pointer has been while held, newest first, for the trail; it shrinks away when let go
2592 IF down THEN FOR i=trail TO 2 STEP -1: LET trailx(i)=trailx(i-1): LET traily(i)=traily(i-1): NEXT i: LET trailx(1)=aimx: LET traily(1)=aimy: IF trailsize<trail THEN LET trailsize=trailsize+1
2594 IF NOT down AND trailsize>0 THEN LET trailsize=trailsize-1
2596 RETURN
2600 REM ======================== the swipe trail: a fat soft line, then a thin bright one, both tapering ========================
2610 IF trailsize<2 THEN RETURN
2620 FOR i=2 TO trailsize: FX "lineStyle", 9-i*0.7, #fff3a0, 30: FX "moveTo", trailx(i-1), traily(i-1): FX "lineTo", trailx(i), traily(i): NEXT i
2630 FOR i=2 TO trailsize: FX "lineStyle", 3-i*0.25, #ffffff, 100-i*9: FX "moveTo", trailx(i-1), traily(i-1): FX "lineTo", trailx(i), traily(i): NEXT i
2640 RETURN
2700 REM ======================== hearts, and the time bar: a green square emoji, stretched ========================
2710 FOR i=1 TO 3: SPRITE "heart", 254-i*15, 8, 70, 70, 0, 20+80*(i<=hearts): NEXT i
2720 LET left=timeleft/3000: IF left>1 THEN LET left=1
2730 LET bar$="timebar": IF timeleft<500 AND INT (frame/16)=2*INT (frame/32) THEN LET bar$="hurry"
2740 SPRITE bar$, 96+40*left, 4, 500*left, 50, 0, 100: RETURN
2800 REM ======================== the music: a tune in DATA, one step every 9 frames (every 6 in a FEVER) ========================
2810 REM each step is a melody note and a bass note, in semitones from middle C; 99 means a rest
2820 LET beat=beat+1: IF beat<9-3*(fever>0) THEN RETURN
2830 LET beat=0: IF NOT music THEN RETURN
2840 IF note=0 OR note>=32 THEN LET note=0: RESTORE 2900
2850 LET note=note+1: READ tune,bass
2860 IF tune<>99 THEN TONE tune
2870 IF bass<>99 THEN TONE bass
2880 RETURN
2900 DATA 12,-12, 16,99, 19,-5, 16,99, 21,-12, 19,99, 16,-5, 12,99
2910 DATA 14,-7, 17,99, 21,0, 17,99, 19,-5, 99,99, 14,-10, 99,99
2920 DATA 12,-12, 16,99, 19,-5, 24,99, 23,-3, 19,99, 16,-8, 14,99
2930 DATA 12,-5, 99,99, 7,-10, 99,99, 12,-12, 99,99, 99,-12, 99,99
3000 REM ======================== the scenery, redrawn every frame with Flash's vector pen (FX) ========================
3010 REM screen shake: move the whole drawing by a random amount that dies away
3020 LET shakex=0: LET shakey=0: IF shake>0 THEN LET shake=shake-1: LET shakex=(RND-0.5)*shake/2: LET shakey=(RND-0.5)*shake/2
3030 FX "clear": FX "lineStyle": FXP "_x", shakex: FXP "_y", shakey
3040 GO SUB 3200
3060 REM two rows of hills, each a few curves
3070 FX "beginFill", #7fc98a, 100: FX "moveTo", -8, 200: FX "lineTo", -8, 138: FX "curveTo", 40, 110, 92, 134: FX "curveTo", 140, 156, 190, 126: FX "curveTo", 232, 104, 264, 128: FX "lineTo", 264, 200: FX "endFill"
3080 FX "beginFill", #4fae5a, 100: FX "moveTo", -8, 200: FX "lineTo", -8, 154: FX "curveTo", 64, 140, 128, 152: FX "curveTo", 196, 164, 264, 148: FX "lineTo", 264, 200: FX "endFill"
3090 REM and the road Percy rides along
3100 FX "beginFill", #d4ad6a, 100: FX "moveTo", -8, 163: FX "lineTo", 264, 163: FX "lineTo", 264, 200: FX "lineTo", -8, 200: FX "endFill"
3110 GO SUB 4000
3120 REM a star's shockwave: an expanding ring that fades as it grows
3130 IF ringlife>0 THEN FX "lineStyle", 2+ringlife/5, #fff07a, ringlife*3: LET cx=ringx: LET cy=ringy: LET rx=ringr: LET ry=ringr: GO SUB 4400
3140 GO SUB 2600: RETURN
3200 REM ======================== the sky: eleven bands, mixed from a top colour and a bottom colour ========================
3210 REM as the round runs down, both colours slide from day towards sunset: a colour is just red*65536 + green*256 + blue
3220 IF playing THEN LET dusk=1-timeleft/3000: IF dusk<0 THEN LET dusk=0
3225 IF dusk>1 THEN LET dusk=1
3230 LET topr=58-18*dusk: LET topg=123-97*dusk: LET topb=213-119*dusk: REM day blue #3a7bd5 to dusk violet #281a5e
3240 LET botr=168+87*dusk: LET botg=224-70*dusk: LET botb=255-165*dusk: REM pale blue #a8e0ff to sunset orange #ff9a5a
3250 FOR band=0 TO 10: LET f=band/10
3260 LET red=topr+(botr-topr)*f: LET green=topg+(botg-topg)*f: LET blue=topb+(botb-topb)*f
3270 REM in a FEVER the sky goes gold and shimmers instead
3280 IF fever>0 THEN LET red=255: LET green=130+100*f+20*SIN (frame/4+band): LET blue=40+120*f
3290 FX "beginFill", INT red*65536+INT green*256+INT blue, 100: FX "moveTo", -8, band*16: FX "lineTo", 264, band*16: FX "lineTo", 264, band*16+16: FX "lineTo", -8, band*16+16: FX "endFill": NEXT band
3300 RETURN
4000 REM ======================== Percy the pelican, cycling ========================
4002 REM he chases a sweet falling ahead of him (he can slow down, but never pedals backwards), easing to his new pace
4004 LET want=0.35: FOR d=1 TO drops: IF dropalive(d) AND dropx(d)>cyclex THEN LET want=0.35+(dropx(d)-cyclex-18)*0.03
4006 NEXT d: IF want>1.4 THEN LET want=1.4
4008 IF want<0.08 THEN LET want=0.08
4010 LET pace=pace+(want-pace)*0.05: LET cyclex=cyclex+pace: IF cyclex>290 THEN LET cyclex=-40
4015 IF gulp>0 THEN LET gulp=gulp-1
4020 REM a wheel turns by the distance rolled over its radius; the pedals turn half as fast
4030 LET wheelturn=cyclex/7: LET crank=wheelturn/2: LET bob=0.6*SIN (2*crank)
4040 REM the far leg goes behind everything else
4050 LET pedal=crank+PI: LET legink=#c86a20: GO SUB 4500
4060 REM two wheels, each a rim and three spokes
4070 FX "lineStyle", 1.5, #2a1052, 100: FOR w=-1 TO 1 STEP 2: LET cx=cyclex+12*w: LET cy=156: LET rx=7: LET ry=7: GO SUB 4400
4080 FOR s=0 TO 2: LET a=wheelturn+s*PI/3: FX "moveTo", cx-7*COS a, cy-7*SIN a: FX "lineTo", cx+7*COS a, cy+7*SIN a: NEXT s: NEXT w
4090 REM the frame joins back wheel, pedals, seat and handlebars
4100 FX "lineStyle", 2, #e8364f, 100: FX "moveTo", cyclex-12, 156: FX "lineTo", cyclex, 157: FX "lineTo", cyclex+8, 146: FX "lineTo", cyclex-4, 146: FX "lineTo", cyclex-12, 156
4110 FX "moveTo", cyclex-4, 146: FX "lineTo", cyclex, 157: FX "moveTo", cyclex+8, 146: FX "lineTo", cyclex+12, 156: FX "moveTo", cyclex+8, 146: FX "lineTo", cyclex+9, 141: FX "lineTo", cyclex+13, 141
4120 FX "lineStyle", 2, #2a1052, 100: FX "moveTo", cyclex-7, 145: FX "lineTo", cyclex-1, 145
4130 REM body: a white egg that bobs as he pushes the pedals
4140 FX "lineStyle", 1.5, #2a1052, 100: FX "beginFill", #f6f2ea, 100: LET cx=cyclex-2: LET cy=135+bob: LET rx=9: LET ry=6.5: GO SUB 4400: FX "endFill"
4150 FX "lineStyle", 4, #f6f2ea, 100: FX "moveTo", cyclex+4, 133+bob: FX "curveTo", cyclex+9, 129+bob, cyclex+8, 122+bob
4160 FX "lineStyle", 1.5, #2a1052, 100: FX "beginFill", #f6f2ea, 100: LET cx=cyclex+8: LET cy=120+bob: LET rx=3.5: LET ry=3.5: GO SUB 4400: FX "endFill"
4170 REM the famous beak, with a pouch that wobbles, and bulges after a GULP
4180 LET pouch=1.5*SIN (frame/10)+gulp/5
4190 FX "beginFill", #f39c34, 100: FX "moveTo", cyclex+10, 121+bob: FX "curveTo", cyclex+17, 129+bob+pouch, cyclex+26, 123+bob: FX "lineTo", cyclex+10, 119+bob: FX "endFill"
4200 FX "beginFill", #ffc04d, 100: FX "moveTo", cyclex+10, 118.5+bob: FX "lineTo", cyclex+27, 122.5+bob: FX "lineTo", cyclex+10, 121+bob: FX "endFill"
4210 FX "lineStyle": FX "beginFill", #2a1052, 100: LET cx=cyclex+8.5: LET cy=119+bob: LET rx=0.9: LET ry=0.9: GO SUB 4400: FX "endFill"
4220 REM a wing reaches forward to hold the handlebars
4230 FX "lineStyle", 1.5, #2a1052, 100: FX "beginFill", #cfc8bb, 100: FX "moveTo", cyclex-9, 133+bob: FX "curveTo", cyclex+2, 128+bob, cyclex+12, 141: FX "curveTo", cyclex, 139+bob, cyclex-9, 133+bob: FX "endFill"
4240 LET pedal=crank: LET legink=#ff9a3c: GO SUB 4500: RETURN
4400 REM ======================== an ellipse at (cx,cy) with radii rx, ry ========================
4410 REM eight curves; each one's control point sits out at the corner of its slice
4420 FX "moveTo", cx+rx, cy
4430 FOR s=1 TO 8: LET a=s*PI/4: LET mid=a-PI/8: FX "curveTo", cx+rx*COS mid/COS (PI/8), cy+ry*SIN mid/COS (PI/8), cx+rx*COS a, cy+ry*SIN a: NEXT s
4440 RETURN
4500 REM ======================== one leg, from hip to pedal, bending at the knee ========================
4510 LET hipx=cyclex-3: LET hipy=142+bob
4520 LET footx=cyclex+3.5*COS pedal: LET footy=157+3.5*SIN pedal
4530 LET dx=footx-hipx: LET dy=footy-hipy: LET reach=SQR (dx*dx+dy*dy): IF reach>15.8 THEN LET reach=15.8
4540 REM which way is the foot? ATN only covers half a circle, so turn it round when the foot is behind
4550 LET toward=ATN (dy/(dx+0.0001))+PI*(dx<0)
4560 REM thigh and shin are both 8 long, so half the reach over 8 is the cosine of the knee's bend
4570 LET bend=ACS (reach/16)
4580 LET kneex=hipx+8*COS (toward-bend): LET kneey=hipy+8*SIN (toward-bend)
4590 FX "lineStyle", 2, legink, 100: FX "moveTo", hipx, hipy: FX "lineTo", kneex, kneey: FX "lineTo", footx, footy
4600 REM and a webbed foot on the pedal
4610 FX "lineStyle": FX "beginFill", legink, 100: FX "moveTo", footx-1, footy: FX "lineTo", footx+4, footy-1: FX "lineTo", footx+4, footy+1.5: FX "endFill": RETURN
