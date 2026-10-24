5 REM touch: left right space=JUMP m=MUSIC l=LOADER
10 REM ======================== MINER NED: a Manic Miner tribute ========================
20 REM The rules of Matthew Smith's Manic Miner (1983), as written up in mrcook's C++ port,
30 REM played in BASIC with new caverns and new sprites. Collect every flashing key, then
40 REM step into the portal before the air runs out. Ned's jump is fixed once he leaves the
50 REM ground, he can't walk against a conveyor, crumbling floors give way under him,
60 REM he can jump up through floors but not walls, and a long fall is fatal.
70 REM
80 REM   100 setup     300 title       400 a new game     500 start a cavern     640 the game loop
85 REM   800 a life lost   850 game over   900 cavern complete
90 REM  1000 standing: walk, turn, jump   1100 jumping   1200 falling   1300 is Ned standing?
92 REM  1350 a wall in the way?   1400 nasties, keys, portal   1500 crumbling floors
94 REM  1600 guardians   1700 sprites   1800 conveyors   1900 air   2000 tiles   2100 boxes   2500 music
96 REM  3000 cavern 1 data   3200 cavern 2 data      A/D or O/P walk, SPACE or W jumps, M music, L loader
100 REM ======================== setup ========================
110 REM sprites are pictures in rows: "." is see-through, W white, digits and a-h are Spectrum colours (a-h bright)
120 SPRITE "ned0","......WWWW......",".....WWWWWWg....","...WWWWWWWWWW...",".....W.WW.W.....",".....WWWWWW.....","......WWWW......",".....WWWWWW.....","....WWWWWWWW....","...WW.WWWW.WW...","...W..WWWW..W...","......WWWW......","......WWWW......",".....WW..WW.....",".....WW..WW.....",".....W....W.....","....WW....WW...."
130 SPRITE "ned1","......WWWW......",".....WWWWWWg....","...WWWWWWWWWW...",".....W.WW.W.....",".....WWWWWW.....","......WWWW......",".....WWWWWW.....","....WWWWWWWW....","....WWWWWWW.W...","....W.WWWW..W...","......WWWW......","......WWWW......",".....WW.WW......","....WW...WW.....","...WW.....WW....","...W.......W...."
140 SPRITE "ned2","......WWWW......",".....WWWWWWg....","...WWWWWWWWWW...",".....W.WW.W.....",".....WWWWWW.....","......WWWW......",".....WWWWWW.....","....WWWWWWWW....","...WW.WWWW.WW...","...W..WWWW..W...","......WWWW......","......WWWW......","......WWWW......","......WW.W......","......W..W......",".....WW..WW....."
150 SPRITE "ned3","......WWWW......",".....WWWWWWg....","...WWWWWWWWWW...",".....W.WW.W.....",".....WWWWWW.....","......WWWW......",".....WWWWWW.....","....WWWWWWWW....","...W.WWWWWWW....","...W..WWWW.W....","......WWWW......","......WWWW......",".....WW.WW......","......WWW.......",".....WW.WW......","....WW...W......"
160 SPRITE "robot0","......f.........",".....fff........","...ffffffffff...","...f.cc..cc.f...","...f.cc..cc.f...","...ffffffffff...","...f.gggggg.f...","...ffffffffff...",".....ffffff.....","...ffffffffff...","..ff.ffffff.ff..","..f..ffffff..f..",".....ffffff.....",".....ff..ff.....","....fff..fff....","....fff..fff...."
170 SPRITE "robot1","......f.........",".....fff........","...ffffffffff...","...f..cc..ccf...","...f..cc..ccf...","...ffffffffff...","...f.g.g.g.gf...","...ffffffffff...",".....ffffff.....","...ffffffffff...","..ff.ffffff.ff..","..f..ffffff..f..",".....ffffff.....","....ff....ff....","...fff....fff...","...fff....fff..."
180 SPRITE "spring0","................","....dddddddd....","...d.dddddd.d...","....dddddddd....","......dddd......",".....d....d.....","......dddd......",".....d....d.....","......dddd......",".....d....d.....","......dddd......","....dddddddd....","...dddddddddd...","...dddddddddd...","................","................"
190 SPRITE "spring1","................","................","................","....dddddddd....","...d.dddddd.d...","....dddddddd....","......dddd......",".....dddddd.....","......dddd......",".....dddddd.....","......dddd......","....dddddddd....","...dddddddddd...","...dddddddddd...","................","................"
200 SPRITE "key1","..ggg...",".g...g..",".g...g..","..ggg...","...g....","...gg...","...g....","...gg..."
205 SPRITE "key2","..fff...",".f...f..",".f...f..","..fff...","...f....","...ff...","...f....","...ff..."
210 SPRITE "key3","..ccc...",".c...c..",".c...c..","..ccc...","...c....","...cc...","...c....","...cc..."
215 SPRITE "key4","..eee...",".e...e..",".e...e..","..eee...","...e....","...ee...","...e....","...ee..."
220 SPRITE "portal1","bbbbbbbbbbbbbbbb","b..............b","b.gggggggggggg.b","b.g..........g.b","b.g.gggggggg.g.b","b.g.g......g.g.b","b.g.g.gggg.g.g.b","b.g.g.g..g.g.g.b","b.g.g.g..g.g.g.b","b.g.g.gggg.g.g.b","b.g.g......g.g.b","b.g.gggggggg.g.b","b.g..........g.b","b.gggggggggggg.b","b..............b","bbbbbbbbbbbbbbbb"
225 SPRITE "portal2","gggggggggggggggg","g..............g","g.bbbbbbbbbbbb.g","g.b..........b.g","g.b.bbbbbbbb.b.g","g.b.b......b.b.g","g.b.b.bbbb.b.b.g","g.b.b.b..b.b.b.g","g.b.b.b..b.b.b.g","g.b.b.bbbb.b.b.g","g.b.b......b.b.g","g.b.bbbbbbbb.b.g","g.b..........b.g","g.bbbbbbbbbbbb.g","g..............g","gggggggggggggggg"
230 SPRITE "boot","....2222........","....2222........","....2222........","....2222........","....2222........","....2222........","....22222.......","....222222......","...22222222.....","...222222222....","..2222222222222.","..222222222222222",".22222222222222.",".+++++++++++++..","................","................"
240 REM the map: one number per cell. 0 air, 1 wall, 2 floor, 3 crumbling floor, 4 conveyor left, 5 conveyor right, 6 nasty
250 DIM tile(16,32): DIM crumb(16,32): LET legend$=" #=~<>*"
255 DIM beltrow(64): DIM beltcol(64)
260 LET most=5: DIM keyrow(most): DIM keycol(most): DIM keygot(most)
270 LET guards=3: DIM gkind(guards): DIM gx(guards): DIM gy(guards): DIM gmin(guards): DIM gmax(guards): DIM gspeed(guards)
275 DIM tune(32): RESTORE 2550: FOR q=1 TO 32: READ tune(q): NEXT q
280 LET hi=KEPT "minerned.hi": LET music=1: LET wasm=0
290 BORDER 0: PAPER 0: INK 7: BRIGHT 1
300 REM ======================== title ========================
310 CLS: FX "lineStyle"
320 PRINT AT 2,11; INK 6; "MINER NED"
330 PRINT AT 4,4; INK 5; "a tribute to Manic Miner"
340 PRINT AT 5,4; INK 5; "(Matthew Smith, 1983)"
350 PRINT AT 9,2; INK 7; "A D or O P   walk"
360 PRINT AT 10,2; INK 7; "SPACE or W   jump"
370 PRINT AT 11,2; INK 7; "M music      L loader"
380 PRINT AT 13,2; INK 4; "get the keys, then the portal"
390 PRINT AT 17,6; INK 6; "PRESS SPACE TO START"
392 LET tick=0
394 REPEAT: SPRITE CLEAR: LET tick=tick+1: SPRITE "ned"+STR$ (INT (tick/3)-4*INT (tick/12)), 120, 112: GO SUB 2500: HALT: HALT
396 IF KEY "l" THEN LOADER
398 UNTIL KEY " " OR KEY CHR$ 13 OR MOUSEB
400 REM ======================== a new game ========================
410 LET lives=3: LET score=0: LET cavern=1
500 REM ======================== start (or restart) a cavern ========================
510 CLS: FX "lineStyle": SPRITE CLEAR
520 IF cavern=1 THEN RESTORE 3000
530 IF cavern=2 THEN RESTORE 3200
540 READ name$, edge: BORDER edge
550 LET keys=0: LET belts=0
560 FOR r=1 TO 16: READ row$
570 FOR c=1 TO 32: LET ch$=row$(c): LET crumb(r,c)=0: LET tile(r,c)=0
580 FOR q=1 TO 7: IF ch$=legend$(q) THEN LET tile(r,c)=q-1
590 NEXT q
592 IF ch$="k" THEN LET keys=keys+1: LET keyrow(keys)=r: LET keycol(keys)=c: LET keygot(keys)=0
594 IF ch$="P" THEN LET portrow=r: LET portcol=c
596 IF ch$="N" THEN LET nedx=(c-1)*8: LET nedy=(r-1)*8
597 IF tile(r,c)=4 OR tile(r,c)=5 THEN LET belts=belts+1: LET beltrow(belts)=r: LET beltcol(belts)=c
598 IF tile(r,c)>0 THEN LET tr=r: LET tc=c: GO SUB 2000
599 NEXT c: NEXT r
600 READ guards: FOR g=1 TO guards: READ gkind(g),gx(g),gy(g),gmin(g),gmax(g),gspeed(g): NEXT g
605 LET keysleft=keys: LET facing=1: LET walking=0: LET jump=-1: LET fall=0: LET dead=0: LET done=0: LET tick=0: LET air=224
610 PRINT AT 16,0; PAPER 6; INK 0; "                                ": PRINT AT 16,INT (16-LEN name$/2); PAPER 6; INK 0; name$
615 PRINT AT 17,0; PAPER 2; INK 7; "AIR "
620 LET bx=32: LET by=137: LET bw=224: LET bh=6: LET bcol=#1f7a1f: GO SUB 2100: LET bw=air: LET by=138: LET bh=4: LET bcol=#ffffff: GO SUB 2100
625 GO SUB 1990
627 REM wait for hands off the keys, so the key that started the game is not taken as a jump
628 REPEAT: HALT: UNTIL NOT (KEY " " OR KEY CHR$ 13 OR MOUSEB)
630 REM ======================== the game loop: one step every three frames, about 16 a second, as in the original ========================
640 REPEAT
650 LET tick=tick+1
660 IF jump>=0 THEN GO SUB 1100: GO TO 680
670 IF fall>0 THEN GO SUB 1200: GO TO 680
675 GO SUB 1000
680 GO SUB 1400: GO SUB 1600: GO SUB 1800: GO SUB 1900: GO SUB 2500
690 GO SUB 1700
700 IF KEY "l" THEN LOADER
710 HALT: HALT: HALT
720 UNTIL dead OR done
730 IF done THEN GO TO 900
800 REM ======================== a life lost: the cavern flashes, and it all starts again ========================
810 FOR i=7 TO 0 STEP -1: BORDER i: TONE i*3-12: HALT: HALT: NEXT i
820 LET lives=lives-1: IF lives>0 THEN GO TO 500
850 REM ======================== game over: the boot comes down ========================
860 CLS: FX "lineStyle": SPRITE CLEAR: BORDER 0
870 LET bx=112: LET by=112: LET bw=32: LET bh=8: LET bcol=#cc3333: GO SUB 2100
880 FOR y=-16 TO 96 STEP 4: SPRITE CLEAR: SPRITE "ned0", 120, 96: SPRITE "boot", 120, y: TONE 20-y/6: HALT: HALT: NEXT y
890 SPRITE CLEAR: SPRITE "boot", 120, 96: PRINT AT 6,11; INK 6; "GAME  OVER": FOR i=1 TO 100: HALT: NEXT i: GO TO 300
900 REM ======================== cavern complete: what's left of the air becomes points ========================
910 FOR a=air TO 1 STEP -2: LET air=a: LET score=score+10: LET bx=32+air: LET by=138: LET bw=2: LET bh=4: LET bcol=#1f7a1f: GO SUB 2100: GO SUB 1990: TONE 24-a/10: HALT: NEXT a
920 LET cavern=cavern+1: IF cavern>2 THEN LET cavern=1
930 GO TO 500
1000 REM ======================== Ned is standing: walk, turn, or jump ========================
1010 GO SUB 1300: IF NOT standing THEN LET fall=2: LET walking=0: RETURN
1020 REM a conveyor pushes him along; pushing against it just stops him
1030 LET left=KEY "a" OR KEY "o" OR KEY CHR$ 8 OR conveyor=-1 OR (MOUSEB AND MOUSEX<96)
1040 LET right=KEY "d" OR KEY "p" OR KEY CHR$ 9 OR conveyor=1 OR (MOUSEB AND MOUSEX>160)
1050 LET want=0: IF left AND NOT right THEN LET want=-1
1060 IF right AND NOT left THEN LET want=1
1070 REM turning round takes a step of its own
1080 LET walking=0: IF want=0 THEN GO TO 1090
1085 IF want<>facing THEN LET facing=want ELSE LET walking=1
1090 IF KEY " " OR KEY "w" OR KEY "q" OR KEY CHR$ 11 OR (MOUSEB AND MOUSEX>=96 AND MOUSEX<=160) THEN LET jump=0: RETURN
1092 IF walking THEN GO SUB 1350: IF NOT blocked THEN LET nedx=nedx+2*facing
1094 GO SUB 1500: RETURN
1100 REM ======================== jumping: the same arc every time, 18 steps, up 20 pixels and down again ========================
1110 LET nedy=nedy+INT (jump/2)-4
1120 REM bumping his head on a wall ends the jump, and he falls
1130 LET r=INT (nedy/8)+1: LET c=INT (nedx/8)+1
1140 IF tile(r,c)=1 OR tile(r,c+1)=1 THEN LET nedy=r*8: LET jump=-1: LET fall=2: LET walking=0: RETURN
1150 LET jump=jump+1: TONE 18-ABS (jump-8)
1160 IF jump=18 THEN LET jump=-1: LET fall=6: RETURN
1170 REM he can only land when he is lined up with a row: after 13 steps (two rows up) or 16 (one row up)
1180 IF jump=13 OR jump=16 THEN GO SUB 1300: IF standing THEN LET jump=-1: LET fall=0: RETURN
1185 IF jump=13 OR jump=16 THEN RETURN
1190 IF walking THEN GO SUB 1350: IF NOT blocked THEN LET nedx=nedx+2*facing
1195 RETURN
1200 REM ======================== falling: straight down, four pixels a step; land too hard and he's done for ========================
1210 GO SUB 1300: IF standing THEN LET dead=(fall>=12): LET fall=0: RETURN
1220 LET nedy=nedy+4: LET fall=fall+1: TONE 12-fall
1230 RETURN
1300 REM ======================== is Ned standing on something? (only when his feet are lined up with a row) ========================
1310 LET standing=0: LET conveyor=0: IF nedy-8*INT (nedy/8)<>0 THEN RETURN
1320 LET r=nedy/8+3: LET c=INT (nedx/8)+1: IF r>16 THEN LET standing=1: RETURN
1330 LET under1=tile(r,c): LET under2=tile(r,c+1)
1335 IF (under1>=1 AND under1<=5) OR (under2>=1 AND under2<=5) THEN LET standing=1
1340 IF under1=4 OR under2=4 THEN LET conveyor=-1
1345 IF under1=5 OR under2=5 THEN LET conveyor=1
1348 RETURN
1350 REM ======================== is there a wall in the way? (only matters when he is about to cross into a new column) ========================
1355 LET blocked=0: LET target=0
1360 IF facing=1 AND nedx-8*INT (nedx/8)=6 THEN LET target=INT (nedx/8)+3
1365 IF facing=-1 AND nedx-8*INT (nedx/8)=0 THEN LET target=INT (nedx/8)
1370 IF target<1 OR target>32 THEN RETURN
1375 LET r=INT (nedy/8)+1: LET rows=2: IF nedy-8*INT (nedy/8)<>0 THEN LET rows=3
1380 FOR q=0 TO rows-1: IF r+q<=16 THEN IF tile(r+q,target)=1 THEN LET blocked=1
1385 NEXT q: RETURN
1400 REM ======================== what Ned touches: nasties kill, keys score, the open portal ends the cavern ========================
1410 LET r=INT (nedy/8)+1: LET c=INT (nedx/8)+1: LET rows=2: IF nedy-8*INT (nedy/8)<>0 THEN LET rows=3
1420 FOR q=0 TO rows-1: IF r+q<=16 THEN IF tile(r+q,c)=6 OR tile(r+q,c+1)=6 THEN LET dead=1
1430 NEXT q
1440 FOR k=1 TO keys: IF keygot(k)=0 AND ABS (nedx+8-(keycol(k)-1)*8-4)<10 AND ABS (nedy+8-(keyrow(k)-1)*8-4)<10 THEN LET keygot(k)=1: LET keysleft=keysleft-1: LET score=score+100: GO SUB 1990: TONE 19: TONE 24
1450 NEXT k
1460 IF keysleft=0 AND ABS (nedx-(portcol-1)*8)<4 AND ABS (nedy-(portrow-1)*8)<4 THEN LET done=1
1470 RETURN
1500 REM ======================== crumbling floor: each step he stands on it, it sinks a row of pixels; after eight it is gone ========================
1510 LET r=nedy/8+3: LET c=INT (nedx/8)+1: IF r>16 THEN RETURN
1520 FOR q=c TO c+1: IF tile(r,q)=3 THEN LET crumb(r,q)=crumb(r,q)+1: IF crumb(r,q)>=8 THEN LET tile(r,q)=0
1530 IF tile(r,q)=0 OR tile(r,q)=3 THEN LET tr=r: LET tc=q: GO SUB 2000
1540 NEXT q: RETURN
1600 REM ======================== guardians patrol back and forth; touching one is fatal ========================
1610 FOR g=1 TO guards
1620 IF gkind(g)=1 THEN LET gx(g)=gx(g)+gspeed(g): IF gx(g)<=gmin(g) OR gx(g)>=gmax(g) THEN LET gspeed(g)=-gspeed(g)
1630 IF gkind(g)=2 THEN LET gy(g)=gy(g)+gspeed(g): IF gy(g)<=gmin(g) OR gy(g)>=gmax(g) THEN LET gspeed(g)=-gspeed(g)
1640 IF ABS (nedx-gx(g))<12 AND ABS (nedy-gy(g))<14 THEN LET dead=1
1650 NEXT g: RETURN
1700 REM ======================== everything that moves is a sprite, redrawn every step ========================
1710 SPRITE CLEAR
1720 FOR k=1 TO keys: IF keygot(k)=0 THEN SPRITE "key"+STR$ (1+(tick+k)-4*INT ((tick+k)/4)), (keycol(k)-1)*8, (keyrow(k)-1)*8
1730 NEXT k
1740 LET p$="portal1": IF keysleft=0 AND INT (tick/2)=2*INT (tick/4) THEN LET p$="portal2"
1750 SPRITE p$, (portcol-1)*8, (portrow-1)*8
1760 FOR g=1 TO guards: LET f$="0": IF INT (tick/2)<>2*INT (tick/4) THEN LET f$="1"
1770 IF gkind(g)=1 THEN SPRITE "robot"+f$, gx(g)+8-8*SGN gspeed(g), gy(g), 100*SGN gspeed(g), 100
1775 IF gkind(g)=2 THEN SPRITE "spring"+f$, gx(g), gy(g)
1780 NEXT g
1785 REM his walking pictures follow his position, two pixels a picture; a negative width faces him left
1790 LET n$="ned"+STR$ (INT (nedx/2)-4*INT (nedx/8))
1795 IF facing=1 THEN SPRITE n$, nedx, nedy ELSE SPRITE n$, nedx+16, nedy, -100, 100
1797 FOR i=1 TO lives-1: SPRITE "ned"+STR$ (INT (tick/3+i)-4*INT ((tick/3+i)/4)), i*20-16, 160: NEXT i
1799 RETURN
1800 REM ======================== conveyors roll: redraw their stripes a little further along every other step ========================
1810 IF tick-2*INT (tick/2)<>0 THEN RETURN
1820 FOR b=1 TO belts: LET tr=beltrow(b): LET tc=beltcol(b): GO SUB 2000: NEXT b: RETURN
1900 REM ======================== the air runs out: one pixel off the bar every six steps ========================
1910 IF tick-6*INT (tick/6)<>0 THEN RETURN
1920 LET air=air-1: LET bx=32+air: LET by=138: LET bw=1: LET bh=4: LET bcol=#1f7a1f: GO SUB 2100
1930 IF air<=0 THEN LET dead=1
1940 RETURN
1990 LET s$="00000"+STR$ score: LET h$="00000"+STR$ hi: IF score>hi THEN LET hi=score: KEEP "minerned.hi", hi
1995 PRINT AT 19,0; INK 6; "High Score "; h$(LEN h$-5 TO LEN h$); "   Score "; s$(LEN s$-5 TO LEN s$): RETURN
2000 REM ======================== draw the tile at row tr, column tc (or r, c while loading), made of little boxes ========================
2010 LET x0=(tc-1)*8: LET y0=(tr-1)*8: LET kind=tile(tr,tc)
2015 LET bx=x0: LET by=y0: LET bw=8: LET bh=8: LET bcol=#000000: GO SUB 2100
2020 IF kind=1 THEN LET bcol=#b5562a: GO SUB 2100: LET bcol=#5c2a12: LET bh=1: LET by=y0+3: GO SUB 2100: LET by=y0+7: GO SUB 2100: LET bw=1: LET bh=3: LET by=y0: LET bx=x0+3: GO SUB 2100: LET by=y0+4: LET bx=x0+7: GO SUB 2100
2030 IF kind=2 THEN LET bh=3: LET bcol=#d8392b: GO SUB 2100: LET bcol=#7a1a12: LET bw=2: LET bh=1: LET by=y0+3: LET bx=x0+1: GO SUB 2100: LET bx=x0+5: GO SUB 2100
2040 IF kind=3 THEN LET s=crumb(tr,tc): LET by=y0+s: LET bh=2: IF s<7 THEN LET bcol=#d9822b: GO SUB 2100: LET bcol=#000000: LET bw=1: LET bh=1: LET bx=x0+2: GO SUB 2100: LET bx=x0+6: GO SUB 2100
2050 IF kind=4 OR kind=5 THEN LET bh=4: LET bcol=#9aa0a6: GO SUB 2100: LET roll=INT (tick/2)*(9-2*kind): LET roll=roll-4*INT (roll/4): LET bw=2: LET bcol=#3c4046: LET bx=x0+roll: GO SUB 2100: IF roll<2 THEN LET bx=x0+roll+4: GO SUB 2100
2060 IF kind=6 THEN LET bcol=#2f8f2f: LET bx=x0+3: LET by=y0+4: LET bw=2: LET bh=4: GO SUB 2100: LET bcol=#3fbf3f: LET bx=x0+1: LET by=y0+2: LET bw=6: LET bh=3: GO SUB 2100: LET bcol=#ff3355: LET bw=1: LET bh=1: LET bx=x0+2: LET by=y0+1: GO SUB 2100: LET bx=x0+5: LET by=y0+3: GO SUB 2100: LET bx=x0: LET by=y0: GO SUB 2100: LET bx=x0+7: GO SUB 2100
2070 RETURN
2100 REM ======================== a filled box: bx, by (top-left, pixels), bw by bh, colour bcol ========================
2110 FX "beginFill", bcol, 100: FX "moveTo", bx, by: FX "lineTo", bx+bw, by: FX "lineTo", bx+bw, by+bh: FX "lineTo", bx, by+bh: FX "endFill": RETURN
2500 REM ======================== the music: In the Hall of the Mountain King (Grieg, 1875), a note every other step ========================
2510 IF KEY "m" AND NOT wasm THEN LET music=1-music
2520 LET wasm=KEY "m": IF NOT music OR tick-2*INT (tick/2)<>0 THEN RETURN
2530 LET note=INT (tick/2)-32*INT (tick/64)+1: TONE tune(note)-5: RETURN
2550 DATA 4,6,7,9,11,7,11,11
2560 DATA 10,6,10,10,9,5,9,9
2570 DATA 4,6,7,9,11,7,11,16
2580 DATA 14,11,7,11,14,14,14,14
3000 REM ======================== cavern 1: name, border colour, 16 rows of 32 cells, then the guardians ========================
3005 REM # wall  = floor  ~ crumbling  < > conveyors  * nasty  k key  P portal (top-left)  N where Ned starts (top-left)
3010 DATA "The Boiler Room", 1
3020 DATA "################################"
3021 DATA "#                            P #"
3022 DATA "#         *                k   #"
3023 DATA "#         ~~~~~~~        ======#"
3024 DATA "#   k                          #"
3025 DATA "# ========         =====       #"
3026 DATA "#             k                #"
3027 DATA "#           ======             #"
3028 DATA "#                        k     #"
3029 DATA "#    ~~~~~            =======  #"
3030 DATA "# k                            #"
3031 DATA "#====        >>>>>>>>          #"
3032 DATA "#                              #"
3033 DATA "#N    ======                 ###"
3034 DATA "#              *             ###"
3035 DATA "#=================>>>>>>=======#"
3040 REM how many guardians, then for each: kind (1 walks, 2 bounces), x, y, from, to, speed (pixels a step)
3050 DATA 1, 1,104,104,96,208,2
3200 REM ======================== cavern 2 ========================
3210 DATA "The Pelican's Pantry", 3
3220 DATA "################################"
3221 DATA "#                              #"
3222 DATA "#                 k    *     k #"
3223 DATA "#              =======  =======#"
3224 DATA "#                              #"
3225 DATA "#       >>>>>>                 #"
3226 DATA "# k                            #"
3227 DATA "#========         ======       #"
3228 DATA "#             k                #"
3229 DATA "#          ~~~~~~              #"
3230 DATA "#    k                         #"
3231 DATA "#   ======            =======  #"
3232 DATA "#                    #         #"
3233 DATA "# N         <<<<<<   #      P  #"
3234 DATA "#     *              #  *      #"
3235 DATA "#=======~~~~===================#"
3250 DATA 2, 1,144,40,144,176,1, 2,128,24,24,88,2
