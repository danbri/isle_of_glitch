10 REM 3D MONSTER MAZE - after Malcolm Evans' 1981 ZX81 original. Rex's sprites and the view geometry follow the original code.
20 BORDER 15: PAPER 7: INK 0: BRIGHT 1: CLS
30 DIM m(17,16): DIM dr(3): DIM dc(3): DIM cs(7): DIM hh(7): DIM sn$(11,3): DIM sr(11): DIM sc(11)
40 RESTORE 50: FOR i=0 TO 3: READ dr(i),dc(i): NEXT i: FOR i=0 TO 7: READ cs(i),hh(i): NEXT i
50 DATA -1,0,0,1,1,0,0,-1,0,12,1,11,5,7,8,4,10,2,11,1,12,1,13,1
60 RESTORE 2990: FOR i=1 TO 11: READ sn$(i),sr(i),sc(i): NEXT i
70 IF rt0=0 THEN LET rt0=16: LET won=0
80 REM --- the ringmaster ---
90 PRINT AT 1,8; "3D MONSTER MAZE"
100 PRINT AT 3,2; "ROLL UP, ROLL UP. WELCOME TO": PRINT "  THE CIRCUS OF THE DARK MAZE."
110 PRINT '"  SEE THE AMAZING TYRANNOSAURUS": PRINT "  REX, KING OF THE DINOSAURS,": PRINT "  IN HIS LAIR. FIND THE EXIT": PRINT "  BEFORE HE FINDS YOU."
120 PRINT '"  A D TURN (O P, 5 8, CURSORS)": PRINT "  W WALKS FORWARD (Q, 7, UP)": PRINT "  S TURNS ROUND"
125 PRINT AT 16,2; "OR TAP THE MOVE BUTTONS"
127 PRINT AT 18,2; "L GOES BACK TO THE LOADER"
130 IF won>0 THEN PRINT AT 2,3; "ESCAPES: "; won; "  REX IS QUICKER"
140 SPRITE "d2l", 210, 116, 200, 183
150 PRINT AT 21,2; "PRESS A KEY OR TAP TO ENTER": GO SUB 1500
160 CLS: PRINT AT 10,7; "BUILDING THE MAZE..."
170 REM --- maze: random passageways from the south-east corner, as the original does ---
180 FOR i=0 TO 17: FOR j=0 TO 16: LET m(i,j)=1: NEXT j: NEXT i
190 LET x=16: LET y=15: LET m(x,y)=0: LET mr=16: LET p=0
200 REPEAT: LET p=p+1
210 LET f=INT (RND*4): LET l=1+INT (RND*7)
220 FOR k=1 TO l
230 LET nx=x+dr(f): LET ny=y+dc(f)
240 IF nx<1 OR nx>16 OR ny<1 OR ny>15 THEN LET k=l: GO TO 290
250 IF m(nx,ny)=0 THEN LET x=nx: LET y=ny: GO TO 290
260 REM a new passage may cross another but must not run beside one
270 IF (m(nx+dc(f),ny+dr(f))=0 OR m(nx-dc(f),ny-dr(f))=0) THEN LET k=l: GO TO 290
280 LET m(nx,ny)=0: LET x=nx: LET y=ny: IF x<mr THEN LET mr=x
290 NEXT k
300 UNTIL (p>=120 AND mr<=2) OR p>500
302 REM a bounded fallback: join the start to a northern passage with an interior loop
304 IF mr<=2 THEN GO TO 310
306 FOR i=1 TO 16: LET m(i,1)=0: LET m(i,15)=0: NEXT i
308 FOR j=1 TO 15: LET m(1,j)=0: LET m(16,j)=0: NEXT j
310 REM prefer a distant northern dead end; never seal passages or disconnect the maze
312 LET ex=16: LET ey=15: LET eb=-1
314 FOR i=1 TO 7: FOR j=1 TO 15
316 IF m(i,j)<>0 THEN GO TO 348
320 LET n=0: FOR k=0 TO 3: IF m(i+dr(k),j+dc(k))=0 THEN LET n=n+1
330 NEXT k
340 LET d=31-i-j+100*(n=1)
344 IF d>eb THEN LET eb=d: LET ex=i: LET ey=j
348 NEXT j: NEXT i
350 LET m(ex,ey)=2
360 LET pr=16: LET pc=15: LET f=0: LET st=0: LET seen=0: LET stuck=0: LET rs=0: LET mv=1: LET lm=0
370 REM Rex starts on a reachable passage, well away from the player and off the exit
372 LET rr=16: LET rc=15: LET rb=0
374 FOR i=1 TO 16: FOR j=1 TO 15
376 IF m(i,j)=0 AND 31-i-j>rb THEN LET rr=i: LET rc=j: LET rb=31-i-j
380 NEXT j: NEXT i
390 LET nt=TICKS+rt0*2
395 LET la=0: LET nk=0
400 REM --- main loop: one turn per press; walking repeats at a steady pace ---
410 REPEAT
420 LET k$=INKEY$: LET act=0
422 IF k$=CHR$ 8 OR k$="a" OR k$="A" OR k$="o" OR k$="O" OR k$="5" THEN LET act=1
424 IF k$=CHR$ 9 OR k$="d" OR k$="D" OR k$="p" OR k$="P" OR k$="8" THEN LET act=2
426 IF k$=CHR$ 11 OR k$="w" OR k$="W" OR k$="q" OR k$="Q" OR k$="7" THEN LET act=3
428 IF k$=CHR$ 10 OR k$="s" OR k$="S" THEN LET act=4
429 IF k$="l" OR k$="L" THEN LOADER
430 IF MOUSEB=1 AND MOUSEX>=0 AND MOUSEX<256 AND MOUSEY<=19 AND MOUSEY>=-16 THEN LET act=INT (MOUSEX/64)+1: IF act=2 THEN LET act=3: GO TO 436
432 IF MOUSEB=1 AND MOUSEX>=128 AND MOUSEX<192 AND MOUSEY<=19 AND MOUSEY>=-16 THEN LET act=2
436 LET do=0: IF act<>0 THEN IF act<>la OR (act=3 AND TICKS>=nk) THEN LET do=1: LET nk=TICKS+8
438 LET la=act
440 IF do=1 AND act=1 THEN LET f=(f+3)-INT ((f+3)/4)*4: LET mv=1
442 IF do=1 AND act=2 THEN LET f=(f+1)-INT ((f+1)/4)*4: LET mv=1
444 IF do=1 AND act=4 THEN LET f=(f+2)-INT ((f+2)/4)*4: LET mv=1
450 IF do=0 OR act<>3 THEN GO TO 470
452 LET nr=pr+dr(f): LET nc2=pc+dc(f)
454 IF nr<1 OR nr>16 OR nc2<1 OR nc2>15 THEN GO TO 470
460 IF m(nr,nc2)=0 OR m(nr,nc2)=2 THEN LET pr=nr: LET pc=nc2: LET st=st+1: LET mv=1: LET lm=TICKS
470 IF m(pr,pc)=2 THEN GO TO 700
475 IF rr=pr AND rc=pc THEN GO TO 800
480 IF TICKS>nt THEN GO SUB 900: LET nt=TICKS+rt0*(1+(TICKS-lm>60)): IF mv=0 THEN GO SUB 1200
490 IF rr=pr AND rc=pc THEN GO TO 800
500 IF mv=1 THEN GO SUB 1000: LET mv=0
510 PAUSE 1
520 UNTIL 0
700 REM --- escaped ---
710 LET won=won+1: LET rt0=rt0-3: IF rt0<8 THEN LET rt0=8
720 CLS: PRINT AT 8,8; "YOU HAVE ESCAPED": PRINT AT 10,9; "SCORE "; st
730 FOR i=0 TO 12 STEP 2: BEEP 0.08,i: NEXT i
740 PRINT AT 13,2; "THE RINGMASTER INSISTS ON": PRINT AT 14,2; "ANOTHER PERFORMANCE. REX IS": PRINT AT 15,2; "HUNGRIER AND QUICKER NOW."
750 PRINT AT 21,2; "PRESS A KEY OR TAP TO GO ON": GO SUB 1500: GO TO 20
800 REM --- the kill: Rex's mouth, then the posthumous award ---
810 CLS: SPRITE "d0r", 40, 0, 400, 367
820 FOR i=1 TO 3: BEEP 0.15,-24: BEEP 0.1,-20: NEXT i: PAUSE 60
830 CLS: PRINT AT 5,3; "YOU HAVE BEEN POSTHUMOUSLY": PRINT AT 6,3; "AWARDED THE TITLE OF"
840 PRINT AT 8,10; "REX'S LUNCH"
850 PRINT AT 11,8; "SCORE "; st
860 PRINT AT 21,2; "PRESS A KEY OR TAP TO RETRY": GO SUB 1500: GO TO 20
900 REM --- Rex takes a step: two steps per location, towards you along the larger axis ---
910 LET rs=1-rs: IF rs=1 THEN RETURN
920 LET ddr=pr-rr: LET ddc=pc-rc: LET stuck=1
930 IF ABS ddr>=ABS ddc AND ddr<>0 THEN IF m(rr+SGN ddr,rc)<>1 THEN LET rr=rr+SGN ddr: LET stuck=0: RETURN
940 IF ddc<>0 THEN IF m(rr,rc+SGN ddc)<>1 THEN LET rc=rc+SGN ddc: LET stuck=0: RETURN
950 IF ddr<>0 THEN IF m(rr+SGN ddr,rc)<>1 THEN LET rr=rr+SGN ddr: LET stuck=0
960 RETURN
1000 REM --- draw the view: six sections, sides first (near to far), then wall faces (far to near), then Rex ---
1010 CLS: LET seen=0: FX "lineStyle"
1020 LET lf=(f+3)-INT ((f+3)/4)*4: LET rt2=(f+1)-INT ((f+1)/4)*4: LET far=6
1030 FOR d=0 TO 5
1040 LET r=pr+dr(f)*d: LET c=pc+dc(f)*d
1050 LET xa=32+cs(d)*8: LET xb=32+cs(d+1)*8: LET ta=16+(12-hh(d))*16/3: LET tb=16+(12-hh(d+1))*16/3: LET ba=16+(12+hh(d))*16/3: LET bb=16+(12+hh(d+1))*16/3
1060 LET lw=m(r+dr(lf),c+dc(lf)): LET rw=m(r+dr(rt2),c+dc(rt2))
1070 IF lw=1 THEN LET x0=xa: LET x1=xb: GO SUB 1400
1080 IF lw<>1 THEN FX "chequer": FX "moveTo", xa, tb: FX "lineTo", xb, tb: FX "lineTo", xb, bb: FX "lineTo", xa, bb: FX "lineTo", xa, tb: FX "endFill"
1090 IF rw=1 THEN LET x0=256-xa: LET x1=256-xb: GO SUB 1400
1100 IF rw<>1 THEN FX "chequer": FX "moveTo", 256-xb, tb: FX "lineTo", 256-xa, tb: FX "lineTo", 256-xa, bb: FX "lineTo", 256-xb, bb: FX "lineTo", 256-xb, tb: FX "endFill"
1110 LET fw=m(r+dr(f),c+dc(f))
1120 IF fw=1 THEN FX "chequer": FX "moveTo", xb, tb: FX "lineTo", 256-xb, tb: FX "lineTo", 256-xb, bb: FX "lineTo", xb, bb: FX "lineTo", xb, tb: FX "endFill": LET far=d: LET d=5
1130 IF fw=2 THEN GO SUB 1300: LET far=d: LET d=5
1140 NEXT d
1150 IF far=6 THEN FX "beginFill", #000000, 100: FX "moveTo", 128, tb: FX "lineTo", 128, bb: FX "lineTo", 128, tb: FX "endFill"
1155 GO SUB 1600
1160 GO SUB 1200
1170 RETURN
1200 REM --- Rex and the status line (redrawn without touching the view) ---
1210 SPRITE CLEAR: LET seen=0: LET los=0
1220 IF rr=pr OR rc=pc THEN LET los=1: LET tr=rr: LET tc=rc: REPEAT: LET tr=tr+SGN (pr-tr): LET tc=tc+SGN (pc-tc): IF m(tr,tc)=1 THEN LET los=0
1230 IF rr=pr OR rc=pc THEN UNTIL los=0 OR (tr=pr AND tc=pc)
1240 LET di=ABS (pr-rr)+ABS (pc-rc)
1250 LET ah=(rr-pr)*dr(f)+(rc-pc)*dc(f): LET sd=(rr-pr)*dc(f)-(rc-pc)*dr(f)
1260 IF los=1 AND ah>0 AND ah<=5 AND sd=0 AND ah<=far THEN LET seen=1: LET i=(ah-1)*2+rs+1: SPRITE sn$(i), 32+sc(i)*8, 16+sr(i)*16/3, 400, 800/3
1270 LET m$="HE IS HUNTING FOR YOU"
1280 IF di>=7 AND di<=8 THEN LET m$="FOOTSTEPS APPROACHING"
1290 IF di<=6 AND di>=3 AND los=1 THEN LET m$="REX HAS SEEN YOU"
1292 IF di<3 AND los=1 AND ah<0 THEN LET m$="RUN HE IS BEHIND YOU"
1294 IF di<3 AND los=1 AND sd<>0 AND ah=0 THEN LET m$="RUN HE IS BESIDE YOU"
1296 IF seen=0 AND stuck=1 THEN LET m$="REX LIES IN WAIT"
1298 PRINT AT 18,0; "                                ": PRINT AT 18,1; m$: PRINT AT 0,1; "3D MONSTER MAZE": PRINT AT 0,21; "STEPS "; st; " ": RETURN
1300 REM --- the exit pattern: concentric squares in the facing-wall slot ---
1310 LET q=0: FOR e=0 TO 5
1320 FX "beginFill", q*#ffffff, 100: FX "moveTo", xb+e*(128-xb)/6, tb+e*(80-tb)/6: FX "lineTo", 256-xb-e*(128-xb)/6, tb+e*(80-tb)/6: FX "lineTo", 256-xb-e*(128-xb)/6, bb-e*(bb-80)/6: FX "lineTo", xb+e*(128-xb)/6, bb-e*(bb-80)/6: FX "endFill"
1330 LET q=1-q: NEXT e
1340 RETURN
1400 REM --- a side wall the ZX81 way: one step per character column, edges snapped to quarter-character rows ---
1410 LET nc=ABS (x1-x0)/8: LET sg=SGN (x1-x0): LET q=128/48
1420 FX "beginFill", #000000, 100: FX "moveTo", x0, INT (ta/q+0.5)*q
1430 FOR k=1 TO nc: LET yy=INT ((ta+(tb-ta)*(k-1)/nc)/q+0.5)*q: LET yb=INT ((ta+(tb-ta)*k/nc)/q+0.5)*q: FX "lineTo", x0+k*8*sg, yy: FX "lineTo", x0+k*8*sg, yb: NEXT k
1440 FX "lineTo", x1, INT (bb/q+0.5)*q
1450 FOR k=nc TO 1 STEP -1: LET yy=INT ((ba+(bb-ba)*k/nc)/q+0.5)*q: LET yb=INT ((ba+(bb-ba)*(k-1)/nc)/q+0.5)*q: FX "lineTo", x0+(k-1)*8*sg, yy: FX "lineTo", x0+(k-1)*8*sg, yb: NEXT k
1460 FX "lineTo", x0, INT (ba/q+0.5)*q: FX "endFill": RETURN
1500 REM wait for a fresh key or tap, then release it before entering the next screen
1510 LET k$=INKEY$: IF k$<>"" OR MOUSEB<>0 THEN PAUSE 1: GO TO 1510
1520 LET k$=INKEY$: IF k$="" AND MOUSEB=0 THEN PAUSE 1: GO TO 1520
1525 IF k$="l" OR k$="L" THEN LOADER
1530 LET k$=INKEY$: IF k$<>"" OR MOUSEB<>0 THEN PAUSE 1: GO TO 1530
1540 RETURN
1600 REM touch controls, below the view and status: left, forward, right, turn round
1610 FX "lineStyle", 1, #000000, 100: FOR b=0 TO 3: FX "beginFill", #ffffff, 100: FX "moveTo", b*64+1, 156: FX "lineTo", b*64+63, 156: FX "lineTo", b*64+63, 191: FX "lineTo", b*64+1, 191: FX "lineTo", b*64+1, 156: FX "endFill": NEXT b: FX "lineStyle"
1620 PRINT AT 21,1; "< LEFT": PRINT AT 21,9; "FORWARD": PRINT AT 21,17; "RIGHT >": PRINT AT 21,25; "U TURN": RETURN
2000 REM --- Rex, from the 1981 ZX81 code: one cell = one quarter of a ZX81 character ---
2001 SPRITE "d1l","................................","...........##########...........","..........############..........",".........##############.........","........################........",".......#################........"
2002 SPRITE "d1l",".......##################.......","......#####.#########.###.......","......###################.......","......###################.......","......###################.......",".....#########.##.#######......."
2003 SPRITE "d1l","....#####################.......","...#####++############++##......","..#####.++#.#.#####.#.++###.....","..#####...####++++####++###.....",".#######......++++....++####....",".#######++..........++######...."
2004 SPRITE "d1l",".#######++..........++######....",".#######++..........++#######...",".#######++++........++#######...",".#########++........++#######...","..########++........++#######...","..++######++++....++#########..."
2005 SPRITE "d1l","..++########++++++++#########...","..##++########++++############..","..##++##################++####..","...###++################++####..","...###++################++####..","....####################++####.."
2006 SPRITE "d1l","....#############..#####++####..",".....######.#####.######++####..",".....######.##############++##..",".....######.##############++#...","....#######..#######.######.....",".##########..######..######....."
2007 SPRITE "d1l",".#########....###....######.....",".########............########...","......................########..","......................#########.",".......................########.","................................"
2008 SPRITE "d1r","........................","..........#######.......",".........##########.....","........###########.....",".......#############....",".......#############...."
2009 SPRITE "d1r",".......##..#####..##....",".......###.######.#.....","......##############....",".....##.#############...","....####.###.#.######...","....####..#######.####.."
2010 SPRITE "d1r","...#####...#####..####..","...######........#####..","...#######.......#####..","..########......######..","..###.#####....#######..",".####.###############..."
2011 SPRITE "d1r",".###.################...",".##..###############....",".##..################...",".#..#################...","....##################..","....###################."
2012 SPRITE "d1r","....####################","...#####################","...############.########","...############..######.","....###################.","....###################."
2013 SPRITE "d1r",".....#####.######.####..",".....####..####..######.","....#####...##...#######",".########...............",".#######................","........................"
2014 SPRITE "d2l","........#####.......",".......#######......","......#########.....","......#########.....","......##.####.#.....","......#########....."
2015 SPRITE "d2l",".....#.#######.#....",".....#..#####.##....",".....##..###..###...","....###......####...","....####....######..","....#####...######.."
2016 SPRITE "d2l","....###########.###.",".....##########.###.","......#########..###","......##########..##",".....############.##","....##############.."
2017 SPRITE "d2l","...###############..","..################..","..#################.","..####.######.#####.","..####..####.######.","...###...#########.."
2018 SPRITE "d2l","..####...####.####..","#####.....###.###...","..............###...","...............####."
2019 SPRITE "d2r","................",".....#####......","....#######.....","....#.###.#.....","....#######.....","...########....."
2020 SPRITE "d2r","...#..###.#.....","...##.....##....","..###....###....","..####..#####...","..###########...",".############..."
2021 SPRITE "d2r",".##.########....",".##.#######.....",".#.#########....","...##########...","..############..","..############.."
2022 SPRITE "d2r","..#######..###..","..#######.####..","..####.#######..","...###.###.#####","..###...........","#####..........."
2023 SPRITE "d3l",".....####...","....######..","...##.##.#..","...#######..","...#.####...","....#....#.."
2024 SPRITE "d3l","...###..###.","...########.","...#########","....########","....#######.","...########."
2025 SPRITE "d3l","..#########.","..#########.","...##.#####.",".####...###.","........####","............"
2026 SPRITE "d3r","...###....","...####...","...####...","....##....","..##..#...",".######..."
2027 SPRITE "d3r",".######...",".#.#####..","..######..","..######..","..#######.",".####....."
2028 SPRITE "d4l","......",".###..",".###..","..#...","##.##.","######"
2029 SPRITE "d4l","####.#",".####.","#####.","....##"
2030 SPRITE "d4r","......","..##..","..##..",".###..","..###.",".####."
2031 SPRITE "d4r",".##...","......"
2032 SPRITE "d5l","##","##","##","##"
2033 SPRITE "d5r","..","##","##",".."
2034 SPRITE "d0r","#######......######################.....####.#####","####........########################.....###.#####","...........########################.......###.####",".........##########################........#######",".......#############################.........####.","#####################################............."
2035 SPRITE "d0r","######################################............","########################################..........","##################....#####################.......","################.......#######....################","###############........######......###############","#################.....#######.......##############"
2036 SPRITE "d0r","################################....##############","##################################################","##################################################","##################################################","##################################################","##################################################"
2037 SPRITE "d0r","##########....###......###......##################","###..###......###.....#.##.....#.####......#######","#....###.....####.....#.##.....#.####.......######","#....#.##....#.##....#..###...#..####......#.##...","#...#..##...#..##....#..###...#...###......#.##...","#...#...#...#...#...#....##..#....###.....#..##..."
2038 SPRITE "d0r","#..#.....#.#....####.....####.....####...#...##...","##.#.....##......##.......##.......###..#....##...","##.#................................####......##..",".##...........................................##.#","..............................................###.",".................................................."
2039 SPRITE "d0r","..................................................","..................................................","..................................................","..................................................","..................................................",".................................................."
2040 SPRITE "d0r","...##.............................................","..####............................................",".#####............................................","###..#............................................","###...#...........................................","##....#......###.................................."
2041 SPRITE "d0r","#.....#...#####.#.................................","#.....#..###....#......##.......##................","##....#.###......#....####.....####.....###.......","####..####.......#...###..#....##..#...###.#....#.","#########.......#....##....#..##...#...##...#..##.","#########.......#...##.....#..##....#.##.....#.##."
2989 REM sprite name, ZX81 row and column of its top-left corner
2990 DATA "d1l",2,6,"d1r",3,7,"d2l",5,8,"d2r",6,10,"d3l",8,10,"d3r",9,11,"d4l",9,12,"d4r",10,12,"d5l",11,13,"d5r",11,13,"d0r",0,1
