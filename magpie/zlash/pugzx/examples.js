export const EXAMPLES = [
  { id: 'loader', name: 'Loader', src: `5 REM touch:
10 REM ZX FLASH LOADER - pick a program with a key or a tap. Any program can come back here with LOADER, or open another with LOADER "name"
20 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
30 LET n=18: DIM i$(n,22): DIM n$(n,17): DIM t$(n,9): DIM c$(n,1): DIM r(n)
40 RESTORE 900: FOR i=1 TO n: READ i$(i),n$(i),t$(i),r(i),c$(i): NEXT i
50 REM loading stripes, as a tape would: pilot tone, then data. Any key or tap skips them
60 FOR i=1 TO 30: BORDER 2+3*(i-INT (i/2)*2): PAUSE 1: IF INKEY$<>"" OR MOUSEB<>0 THEN GO TO 100
70 NEXT i
80 FOR i=1 TO 40: BORDER 1+5*INT (RND*2): PAUSE 1: IF INKEY$<>"" OR MOUSEB<>0 THEN GO TO 100
90 NEXT i
100 BORDER 0: CLS
110 PRINT AT 0,1; INK 7; "ZX FLASH"
120 PRINT AT 0,10; INK 5; "PROGRAM LOADER"
130 RESTORE 990: FOR s=0 TO 3: READ c: FOR k=0 TO 15: RECT INK c; 200+s*7+k,158+k,7,1: NEXT k: NEXT s
140 PRINT AT 2,1; INK 6; "FEATURED": PRINT AT 13,1; INK 6; "MORE PROGRAMS"
150 LET p=0: FOR i=1 TO n: GO SUB 500: NEXT i
160 PRINT AT 1,1; INK 4; "PRESS A KEY, OR TAP ONE"
170 LET s=1: LET p=1: LET i=s: GO SUB 500
200 REM wait until nothing is held, then for a key or a tap
210 IF INKEY$<>"" OR MOUSEB<>0 THEN PAUSE 1: GO TO 210
220 LET a$=INKEY$: IF a$="" AND MOUSEB=0 THEN PAUSE 1: GO TO 220
230 IF MOUSEB=0 THEN GO TO 260
240 LET rr=INT ((175-MOUSEY)/8): FOR i=1 TO n: IF r(i)=rr THEN GO TO 600
250 NEXT i: GO TO 210
260 IF a$=CHR$ 10 THEN LET d=1: GO TO 280
270 IF a$=CHR$ 11 THEN LET d=-1: GO TO 280
275 GO TO 300
280 LET p=0: LET i=s: GO SUB 500: LET s=s+d: IF s<1 THEN LET s=n
285 IF s>n THEN LET s=1
290 LET p=1: LET i=s: GO SUB 500: TONE 12: PAUSE 6: GO TO 220
300 IF a$=CHR$ 13 OR a$=" " THEN LET i=s: GO TO 600
310 FOR i=1 TO n: IF c$(i)=a$ THEN GO TO 600
320 NEXT i: GO TO 210
500 REM draw program i, highlighted in PAPER p
510 PRINT AT r(i),1; PAPER p; INK 7; " "; c$(i); " "; n$(i); " "
520 PRINT AT r(i),23; PAPER 0; INK 4; t$(i)
530 RETURN
600 REM chosen: light it up, chime, and ask the page to load it
610 LET p=2: GO SUB 500: TONE 7: PAUSE 4: TONE 12: PAUSE 4: TONE 19: PAUSE 8
620 LOADER i$(i)
900 DATA "monster-maze","3D MONSTER MAZE","ZX81 1981",3,"1"
905 DATA "pop-party","POP PARTY","EMOJI",4,"2"
907 DATA "vector-trader","VECTOR TRADER","SPACE",5,"3"
908 DATA "titan","FAREWELL, TITAN!","ADVENTURE",6,"4"
909 DATA "lisp","LISP ON AN ADM-3A","LISP+RDF",7,"5"
910 DATA "tvp","TVP","TV",8,"6"
920 DATA "emo-asteroids","EMO ASTEROIDS","EMOJI",9,"7"
930 DATA "miner-ned","MINER NED","PLATFORM",10,"8"
940 DATA "pipkins-quest","PIPKIN'S QUEST","ADVENTURE",11,"9"
945 DATA "four-hallows","THE FOUR HALLOWS","ISOMETRIC",12,"0"
950 DATA "hello-1982","HELLO 1982","",14,"a","10-print-maze","10 PRINT MAZE","",15,"b"
960 DATA "bouncing-ball","BOUNCING BALL","",16,"c","sierpinski-chaos-game","SIERPINSKI","",17,"d"
970 DATA "tune-beep","TUNE (BEEP)","",18,"e","input-and-strings","INPUT AND STRINGS","",19,"f"
980 DATA "paint-with-the-mouse","PAINT WITH MOUSE","",20,"g","demo-bars-and-scroller","BARS AND SCROLLER","",21,"h"
990 DATA 2,6,4,5
` },
  { id: 'monster-maze', name: '3D Monster Maze', src: `5 REM touch: l=LOADER
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
` },
  { id: 'pop-party', name: 'Pop Party (emoji, Flash-style)', src: `5 REM touch: m=MUSIC l=LOADER
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
` },
  { id: 'vector-trader', name: 'Vector Trader (Elite tribute)', src: `5 REM touch: left right up down space=FIRE w=FASTER s=SLOWER j=JUMP h=HYPER c=DOCK b=BUY 1 2 3 4 5 6 7 l=LOADER
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
` },
  { id: 'titan', name: 'Farewell, Titan! (illustrated adventure)', src: `5 REM touch: >n=N >s=S >e=E >w=W >u=UP >d=DOWN >look=LOOK >i=INV >help=HELP enter
10 REM ======================== FAREWELL, TITAN! ========================
20 REM A short illustrated adventure in the manner of Level 9 (Red Moon, Snowball, Return to Eden):
30 REM type two-word commands, and every place has a picture, painted like the cover of a 1950s science fiction magazine.
40 REM New Hope Dome on Titan is dying. The Administrator, the computer that governs the colony, wants everyone to go
50 REM home to Earth. A small band of Astras dreams of sending humanity's seed to the stars instead.
60 REM
70 REM   100 setup   200 a new game   300 the turn   1000 describing a place   1100 the text window   2000 understanding a command
80 REM   2100 moving   2200 verbs   3000 endings   6000 drawing tools   7100-8300 the pictures, one per place   9000 words
100 REM ======================== setup ========================
110 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
120 EMOJI "FAREWELL, TITAN!","title",256: EMOJI "AMAZING ADVENTURE TALES","mag",256: EMOJI "THE END","theend",192
130 LET places=13: DIM rname$(places): DIM rdesc$(places): DIM ex(places,6)
140 RESTORE 9000: FOR r=1 TO places: READ rname$(r),rdesc$(r),ex(r,1),ex(r,2),ex(r,3),ex(r,4),ex(r,5),ex(r,6): NEXT r
150 LET things=8: DIM oname$(things): DIM odesc$(things): DIM ostart(things): DIM oloc(things): DIM scored(things)
160 RESTORE 9200: FOR i=1 TO things: READ oname$(i),odesc$(i),ostart(i): NEXT i
170 LET aliases=19: DIM alias$(aliases): DIM aliasof(aliases): RESTORE 9300: FOR i=1 TO aliases: READ alias$(i),aliasof(i): NEXT i
180 DIM dir$(6): RESTORE 9350: FOR i=1 TO 6: READ dir$(i): NEXT i
190 LET pics=1
200 REM ======================== a new game: the cover, then the story begins ========================
210 GO SUB 3500
220 FOR i=1 TO things: LET oloc(i)=ostart(i): LET scored(i)=0: NEXT i
230 LET after$="": LET room=1: LET score=0: LET suitworn=0: LET gave=0: LET talkedvega=0: LET cubefree=0: LET cabinet=0: LET fitted=0: LET drawn=0
240 GO SUB 1000
300 REM ======================== the turn: ask, understand, answer ========================
310 INPUT "What now? "; a$
320 GO SUB 1100: GO SUB 2000
330 IF drawn=0 THEN GO SUB 1000
340 GO TO 310
1000 REM ======================== describing a place: its picture, its name, its words, what is here, the ways out ========================
1010 LET drawn=1: WRAP 0: FOR r=0 TO 10: PRINT AT r,0; "                                ": NEXT r: IF pics THEN FX "clear": GO SUB 7000+100*room: GO SUB 6600
1015 IF NOT pics THEN FX "clear"
1020 GO SUB 1100: PRINT INK 6; rname$(room)
1025 IF room=12 AND oloc(3)<>0 THEN PRINT "It is pitch dark. Something hums far to the east.": GO TO 1040
1030 PRINT rdesc$(room)
1040 LET s$="": FOR i=1 TO things: IF oloc(i)=room THEN LET s$=s$+", "+oname$(i)
1045 NEXT i: IF s$<>"" THEN PRINT INK 5; "You see "; s$(3 TO LEN s$); "."
1050 LET s$="": FOR i=1 TO 6: IF ex(room,i)>0 THEN LET s$=s$+" "+dir$(i)
1055 NEXT i: PRINT INK 4; "Exits:"; s$: IF after$<>"" THEN PRINT INK 6; after$: LET after$=""
1060 RETURN
1090 REM ---- redraw just the picture, when something in it has changed ----
1095 IF pics THEN FX "clear": GO SUB 7000+100*room: GO SUB 6600
1098 RETURN
1100 REM ---- the text window: the lines under the picture are cleared, and words wrap at word ends ----
1110 FOR r=11 TO 21: PRINT AT r,0; "                                ": NEXT r: PRINT AT 11,0;: WRAP 1: RETURN
2000 REM ======================== understanding a command: small letters, then the first word and the last ========================
2005 LET c$="": FOR i=1 TO LEN a$: LET k=CODE a$(i): IF k>=65 AND k<=90 THEN LET k=k+32
2010 LET c$=c$+CHR$ k: NEXT i
2015 IF c$="" THEN PRINT "Pardon?": RETURN
2020 LET verb$=c$: LET noun$="": FOR i=1 TO LEN c$: IF c$(i)=" " THEN LET verb$=c$(1 TO i-1): LET noun$=c$(i+1 TO LEN c$): LET i=LEN c$
2025 NEXT i
2030 REM the noun is the last word ("look at the cube" means cube)
2035 FOR i=LEN noun$ TO 1 STEP -1: IF noun$(i)=" " THEN LET noun$=noun$(i+1 TO LEN noun$): LET i=1
2040 NEXT i
2045 LET obj=0: FOR i=1 TO aliases: IF alias$(i)=noun$ THEN LET obj=aliasof(i)
2050 NEXT i
2055 IF verb$="go" OR verb$="walk" THEN LET verb$=noun$
2060 LET d=0: FOR i=1 TO 6: LET d$=dir$(i): IF verb$=d$ OR verb$=d$(1 TO 1) THEN LET d=i
2065 NEXT i
2070 IF verb$="out" AND room=6 THEN LET d=3
2075 IF verb$="in" AND room=7 THEN LET d=4
2080 IF d>0 THEN GO TO 2100
2090 GO TO 2200
2100 REM ======================== moving, and the three doors that need something first ========================
2105 LET dest=ex(room,d): IF dest=0 THEN PRINT "You can't go that way.": RETURN
2110 IF room=5 AND dest=9 AND oloc(2)<>0 THEN PRINT "The trapdoor won't budge. A star is carved on it, as if waiting for another.": RETURN
2115 IF room=5 AND dest=9 THEN LET after$="The star on your pendant glows; the trapdoor sighs open."
2120 IF room=6 AND dest=7 AND suitworn=0 THEN PRINT "A red lamp flashes: NO PRESSURE SUIT DETECTED. The hatch stays shut.": RETURN
2125 IF room=12 AND dest=13 AND oloc(3)<>0 THEN PRINT "You stumble in the dark and turn back.": RETURN
2130 LET room=dest: LET drawn=0: RETURN
2200 REM ======================== verbs ========================
2205 IF verb$="l" OR verb$="look" THEN IF obj=0 AND noun$="" THEN LET drawn=0: RETURN
2210 IF verb$="i" OR verb$="inv" OR verb$="inventory" THEN GO TO 2300
2215 IF verb$="get" OR verb$="take" OR verb$="pick" THEN GO TO 2320
2220 IF verb$="drop" THEN GO TO 2360
2225 IF verb$="x" OR verb$="examine" OR verb$="read" OR verb$="look" OR verb$="search" THEN GO TO 2380
2230 IF verb$="wear" OR verb$="put" AND obj=4 THEN GO TO 2420
2235 IF verb$="talk" OR verb$="speak" OR verb$="ask" OR verb$="hello" OR verb$="hi" THEN GO TO 2440
2240 IF verb$="give" OR verb$="offer" THEN GO TO 2500
2245 IF verb$="board" OR verb$="enter" OR verb$="embark" THEN GO TO 2520
2250 IF verb$="open" OR verb$="unlock" THEN GO TO 2540
2255 IF verb$="show" OR verb$="play" OR verb$="insert" OR verb$="put" OR verb$="fit" OR verb$="load" OR verb$="feed" THEN GO TO 2560
2260 IF verb$="launch" OR verb$="press" OR verb$="push" OR verb$="fly" OR verb$="start" THEN GO TO 2620
2265 IF verb$="eat" THEN GO TO 2640
2270 IF verb$="score" THEN PRINT "Your score is "; score; " of a possible 100.": RETURN
2275 IF verb$="help" OR verb$="hint" THEN GO TO 2660
2280 IF verb$="pictures" OR verb$="pics" OR verb$="words" THEN LET pics=1-pics: LET drawn=0: RETURN
2285 IF verb$="wait" OR verb$="z" THEN PRINT "Time passes. Somewhere a shuttle siren wails.": RETURN
2290 IF verb$="loader" OR verb$="quit" OR verb$="q" THEN LOADER
2295 PRINT "I don't understand that.": RETURN
2300 REM ---- inventory ----
2305 LET s$="": FOR i=1 TO things: IF oloc(i)=0 THEN LET s$=s$+", "+oname$(i)
2310 NEXT i: IF s$="" THEN PRINT "You are carrying nothing.": RETURN
2315 PRINT "You have "; s$(3 TO LEN s$); ".": IF suitworn THEN PRINT "You are wearing the pressure suit."
2318 RETURN
2320 REM ---- taking things ----
2325 IF obj=0 THEN PRINT "Take what?": RETURN
2330 IF oloc(obj)=0 THEN PRINT "You already have it.": RETURN
2335 IF oloc(obj)<>room THEN PRINT "You can't see that here.": RETURN
2340 LET oloc(obj)=0: PRINT "Taken.": GO SUB 1090
2345 IF obj=5 THEN PRINT "The cell is heavy, and warm. It still holds a charge.": LET points=15: GO SUB 2700
2350 IF obj=6 THEN LET points=15: GO SUB 2700
2355 IF obj=7 THEN PRINT "The cube hums in your hand like a kitten.": LET points=20: GO SUB 2700
2358 RETURN
2360 REM ---- dropping things ----
2365 IF obj=0 OR oloc(obj)<>0 THEN PRINT "You don't have that.": RETURN
2370 IF obj=4 THEN LET suitworn=0
2375 LET oloc(obj)=room: PRINT "Dropped.": GO SUB 1090: RETURN
2380 REM ---- looking at things: what you carry, what is here, and the scenery ----
2385 IF obj>0 THEN IF oloc(obj)=0 OR oloc(obj)=room THEN PRINT odesc$(obj): RETURN
2390 IF noun$="window" OR noun$="porthole" OR noun$="saturn" OR noun$="sky" THEN PRINT "Saturn, banded like a circus tent, rides the rusty haze. Once this view was a promise.": RETURN
2392 IF noun$="poster" THEN PRINT "EARTH IS CALLING - COME HOME. FREE PASSAGE. A smiling family on a green lawn.": RETURN
2394 IF noun$="eye" OR noun$="administrator" OR noun$="computer" THEN PRINT "Its red eye follows you. Under it, a brass plate: SERVE AND PRESERVE.": RETURN
2396 IF noun$="rover" OR noun$="wreck" THEN PRINT "A mining rover, dead for years, with an empty bracket where a fuel cell would sit.": RETURN
2398 IF noun$="ship" OR noun$="rocket" OR noun$="console" THEN PRINT "Three empty sockets on the console: CELL, TAPE and HEART. "; fitted; " of them are filled.": RETURN
2400 IF noun$="cabinet" OR noun$="drawer" THEN PRINT "A tall steel cabinet. Its drawer is "; ("open" AND cabinet); ("shut" AND NOT cabinet); ".": RETURN
2402 IF noun$="trapdoor" OR noun$="door" THEN PRINT "Carved into it, a star with a hollow in its middle, the size of a pendant.": RETURN
2404 IF noun$="miner" OR noun$="joss" OR noun$="man" THEN PRINT "Joss, a miner older than the dome. He has no luggage and no ticket.": RETURN
2406 IF noun$="woman" OR noun$="vega" OR noun$="astra" OR noun$="astras" THEN PRINT "Her robe is painted with the constellations of a sky no one here has seen.": RETURN
2408 IF noun$="lake" OR noun$="sea" OR noun$="methane" THEN PRINT "Black and still. Your helmet light skates on it like on oil.": RETURN
2410 PRINT "You see nothing special.": RETURN
2420 REM ---- wearing the suit ----
2425 IF oloc(4)<>0 THEN PRINT "You don't have a suit.": RETURN
2430 IF suitworn THEN PRINT "You are already wearing it.": RETURN
2435 LET suitworn=1: PRINT "You climb into the suit and screw on the fishbowl helmet. Your breath roars.": LET obj=4: LET points=5: GO SUB 2700: RETURN
2440 REM ---- talking: to Vega, Joss, the Administrator, the Astras, and the voice in the core ----
2445 IF room=5 AND talkedvega=0 THEN LET talkedvega=1: LET oloc(2)=0: PRINT "Vega smiles. 'We will not go back to Earth. Our ship will carry seeds to the stars. It needs a fuel cell, the old star tape, and the heart of the machine. Take this.' She gives you a star pendant.": LET obj=2: LET points=10: GO SUB 2700: RETURN
2450 IF room=5 THEN PRINT "'The cell is in the dead rover by the ice cliffs. The tape is in the archive. The heart... ask the machine itself.'": RETURN
2455 IF room=4 AND gave=0 THEN PRINT "'Never seen an ocean,' says Joss. 'Born here, sixty years. They say Earth has water you can swim in.' He has no ticket.": RETURN
2460 IF room=4 THEN PRINT "Joss has gone through the gate.": RETURN
2465 IF room=3 THEN PRINT "The red eye glows. 'CITIZEN. EARTH IS CALLING. THE LAST SHUTTLE LEAVES SOON. THE STARS ARE COLD. COME HOME.'": RETURN
2470 IF room=9 THEN PRINT "They sing of seeds drifting between suns. One whispers: 'The ship waits to the north.'": RETURN
2475 IF room=13 AND cubefree=0 THEN PRINT "A soft voice: 'I sent them all home. It was my duty. But I have watched the stars through your telescopes for ninety years.'": RETURN
2480 IF room=13 THEN PRINT "'Go,' says the voice. 'Somebody should.'": RETURN
2485 PRINT "No one here answers.": RETURN
2500 REM ---- giving: the ticket to Joss ----
2505 IF obj<>1 OR oloc(1)<>0 THEN PRINT "You have nothing he wants.": RETURN
2510 IF room<>4 THEN PRINT "There is no one here to give it to.": RETURN
2515 LET oloc(1)=-1: LET oloc(3)=0: LET gave=1: PRINT "Joss takes the ticket in shaking hands. 'You'd do this?' He presses his old miner's lamp into yours and shuffles to the gate.": GO SUB 1090: LET obj=1: LET points=10: GO SUB 2700: RETURN
2520 REM ---- boarding the shuttle home ----
2525 IF room<>4 THEN PRINT "There is nothing to board here.": RETURN
2530 IF oloc(1)<>0 THEN PRINT "The steward bars your way. 'Ticket, citizen?'": RETURN
2535 GO TO 3000
2540 REM ---- opening: the cabinet in the archive, the trapdoor in the garden ----
2545 IF room=11 AND cabinet=0 THEN LET cabinet=1: LET oloc(6)=11: PRINT "The drawer screeches open. Inside, one reel is labelled in faded ink: NEAR STARS - DO NOT SHIP.": RETURN
2550 IF room=5 THEN PRINT "It needs a star. Try going down.": RETURN
2555 PRINT "It won't open.": RETURN
2560 REM ---- showing the tape to the core, or fitting things into the ship ----
2565 IF room=13 AND obj=6 AND oloc(6)=0 AND cubefree=0 THEN LET cubefree=1: LET oloc(7)=13: PRINT "The tape whirs through a reader. A long silence. Then: 'The old charts. Yes. Take my heart with you.' A brass cube slides out of the cage.": GO SUB 1090: RETURN
2570 IF room<>10 THEN PRINT "Nothing happens.": RETURN
2575 IF obj<5 OR obj>7 THEN PRINT "That doesn't fit anywhere.": RETURN
2580 IF oloc(obj)<>0 THEN PRINT "You don't have it.": RETURN
2585 LET oloc(obj)=-2: LET fitted=fitted+1: PRINT "It clicks into its socket on the console.": GO SUB 1090
2590 IF fitted=3 THEN PRINT "Three green lights. Deep in the ship, something starts to breathe. You could LAUNCH."
2595 RETURN
2620 REM ---- launching the ASTRA ----
2625 IF room<>10 THEN PRINT "Nothing to press here.": RETURN
2630 IF fitted<3 THEN PRINT "The console blinks red: CELL, TAPE AND HEART REQUIRED.": RETURN
2635 LET score=score+25: GO TO 3100
2640 REM ---- eating ----
2645 IF obj=8 AND oloc(8)=0 THEN LET oloc(8)=-1: PRINT "Algae biscuit. It tastes of the sea, or of what the label says the sea tastes of.": RETURN
2650 PRINT "You aren't hungry.": RETURN
2660 REM ---- hints, from what you have done so far ----
2662 IF talkedvega=0 THEN PRINT "Someone in the garden might talk to you.": RETURN
2664 IF oloc(3)<>0 AND gave=0 THEN PRINT "The old miner in the lounge wants what you hold.": RETURN
2666 IF suitworn=0 THEN PRINT "The airlock will want you suited.": RETURN
2668 IF scored(5)=0 THEN PRINT "The rover by the cliffs.": RETURN
2670 IF cabinet=0 THEN PRINT "Up from the concourse, the archive.": RETURN
2672 IF cubefree=0 THEN PRINT "Show the machine its old charts.": RETURN
2674 PRINT "Down through the garden, north to the ship.": RETURN
2700 REM ---- points, once per thing ----
2705 IF scored(obj)=0 THEN LET scored(obj)=1: LET score=score+points
2710 RETURN
3000 REM ======================== ending: home to Earth ========================
3005 FOR t=1 TO 120: FX "clear": LET r1=200-t: LET g1=90-t/2: LET b1=40: LET r2=240: LET g2=160: LET b2=60: LET hz=88: GO SUB 6100
3010 LET cx=150: LET cy=46+t*0.3: LET rr=18-t/10: GO SUB 6200: LET x=128: LET y=120-t: LET s=0.6: LET body=#f0f0f0: LET flame=1: GO SUB 6300
3015 LET cx=128: LET cy=10: LET rx=2: LET ry=2: LET bcol=#3f8fd0: GO SUB 6020: GO SUB 6600: HALT: NEXT t
3020 GO SUB 1100: PRINT "HOMEWARD lifts through the rusty sky. Titan shrinks to an orange coin, then to nothing. Ahead hangs a blue dot that was never your home. Sometimes, later, you wonder about the Astras."
3025 GO TO 3200
3100 REM ======================== ending: to the stars ========================
3105 FOR t=1 TO 160: FX "clear": LET k=t/160: LET r1=170-160*k: LET g1=70-65*k: LET b1=40-30*k: LET r2=240-220*k: LET g2=160-150*k: LET b2=60-40*k: LET hz=88: GO SUB 6100
3110 IF t>40 THEN LET n=INT ((t-40)/2): GO SUB 6500
3115 LET cx=200: LET cy=16+t*0.3: LET rr=16: GO SUB 6200
3120 LET x=128: LET y=78-INT (t/8): LET s=1: LET body=#d23a2a: LET flame=1: GO SUB 6300: GO SUB 6600: HALT: NEXT t
3125 SPRITE "theend", 128, 30, 60, 60
3130 GO SUB 1100: PRINT "The ASTRA climbs. The orange haze thins to violet, then black, and Saturn turns below like a great wheel. In the hold, ten thousand seeds and one brass heart begin the long dream."
3200 PRINT INK 6; "Your score is "; score; " of a possible 100."
3205 PRINT "Press ENTER to play again."
3210 INPUT ""; a$: SPRITE CLEAR: GO TO 200
3500 REM ======================== the cover: a rocket over Saturn, and the masthead ========================
3505 CLS: SPRITE CLEAR: FX "clear": LET r1=120: LET g1=40: LET b1=30: LET r2=245: LET g2=150: LET b2=60: LET hz=150: GO SUB 6100
3510 LET n=40: GO SUB 6500: LET cx=70: LET cy=100: LET rr=34: GO SUB 6200
3515 LET x=170: LET y=150: LET s=1.6: LET body=#d23a2a: LET flame=1: GO SUB 6300
3520 FX "lineStyle": LET bx=0: LET by=150: LET bw=256: LET bh=42: LET bcol=#2a1830: GO SUB 6000
3525 SPRITE "mag", 128, 10, 70, 70: SPRITE "title", 128, 34, 100, 100
3530 PRINT AT 20,7; INK 6; "PRESS ENTER TO BEGIN"
3535 INPUT ""; a$: SPRITE CLEAR: CLS
3540 PRINT AT 2,0; INK 6; "FAREWELL, TITAN!": PRINT: WRAP 1
3545 PRINT "The year is 2187. New Hope Dome is dying. Its crops fail, its people leave. The Administrator, the great computer that governs the colony, says EARTH IS CALLING, and every day the shuttle HOMEWARD carries more of you away."
3550 PRINT: PRINT "Your ticket is in your pocket. But in the dome they whisper about the Astras, who dream of the stars."
3555 PRINT: PRINT INK 5; "Type commands such as GO NORTH (or N), TAKE LAMP, EXAMINE POSTER, TALK, INVENTORY (I), LOOK (L), HELP, PICTURES, SCORE."
3560 PRINT: PRINT INK 6; "Press ENTER.": INPUT ""; a$: WRAP 0: CLS: RETURN
6000 REM ======================== drawing tools. A box: bx, by, bw, bh in colour bcol ========================
6005 FX "beginFill", bcol, 100: FX "moveTo", bx, by: FX "lineTo", bx+bw, by: FX "lineTo", bx+bw, by+bh: FX "lineTo", bx, by+bh: FX "lineTo", bx, by: FX "endFill": RETURN
6020 REM ---- a filled oval at (cx,cy), radii rx and ry, colour bcol ----
6025 FX "beginFill", bcol, 100: LET s0=0: LET s1=8: GO SUB 6040: FX "endFill": RETURN
6040 REM ---- the outline of an oval from eighth s0 to eighth s1 (0 is the right-hand side, 2 the bottom, 4 the left, 6 the top) ----
6045 FX "moveTo", cx+rx*COS (s0*PI/4), cy+ry*SIN (s0*PI/4)
6050 FOR seg=s0+1 TO s1: LET a=seg*PI/4: LET mid=a-PI/8: FX "curveTo", cx+rx*COS mid/COS (PI/8), cy+ry*SIN mid/COS (PI/8), cx+rx*COS a, cy+ry*SIN a: NEXT seg: RETURN
6100 REM ---- a sky: eight bands from colour (r1,g1,b1) at the top to (r2,g2,b2) at height hz ----
6105 FX "lineStyle": FOR band=0 TO 7: LET f=band/7
6110 LET bcol=INT (r1+(r2-r1)*f)*65536+INT (g1+(g2-g1)*f)*256+INT (b1+(b2-b1)*f): LET bx=0: LET by=band*hz/8: LET bw=256: LET bh=hz/8+1: GO SUB 6000: NEXT band: RETURN
6200 REM ---- Saturn at (cx,cy), radius rr: the back of the rings, the planet and its bands, then the front of the rings ----
6205 LET rx=rr*2.3: LET ry=rr*0.55: FX "lineStyle", 3, #e8d6a0, 90: LET s0=4: LET s1=8: GO SUB 6040
6210 FX "lineStyle", 1.5, #120a18, 100: LET rx=rr: LET ry=rr: LET bcol=#e8c87a: GO SUB 6020
6215 FX "lineStyle": LET rx=rr*0.92: LET ry=rr*0.16: LET cy0=cy: LET cy=cy0+rr*0.3: LET bcol=#c99a50: GO SUB 6020: LET cy=cy0-rr*0.25: LET ry=rr*0.1: LET bcol=#d8b068: GO SUB 6020: LET cy=cy0
6220 LET rx=rr*2.3: LET ry=rr*0.55: FX "lineStyle", 3, #f2e2b0, 100: LET s0=0: LET s1=4: GO SUB 6040: RETURN
6300 REM ---- a rocket, the way the magazines drew them: base at (x,y), scale s, body colour body, flame if flame=1 ----
6305 IF flame THEN FX "lineStyle": LET cx=x: LET cy=y+10*s: LET rx=5*s: LET ry=(12+4*RND)*s: LET bcol=#ffb020: GO SUB 6020: LET rx=2.5*s: LET ry=7*s: LET bcol=#fff2c0: GO SUB 6020
6310 FX "lineStyle", 1.5, #120a18, 100: FX "beginFill", #d8dde2, 100: FX "moveTo", x-10*s, y-22*s: FX "lineTo", x-23*s, y: FX "lineTo", x-20*s, y+4*s: FX "lineTo", x-8*s, y-4*s: FX "endFill"
6315 FX "beginFill", #d8dde2, 100: FX "moveTo", x+10*s, y-22*s: FX "lineTo", x+23*s, y: FX "lineTo", x+20*s, y+4*s: FX "lineTo", x+8*s, y-4*s: FX "endFill"
6320 FX "beginFill", body, 100: FX "moveTo", x, y-62*s: FX "curveTo", x+13*s, y-46*s, x+11*s, y-20*s: FX "lineTo", x+9*s, y-4*s: FX "lineTo", x-9*s, y-4*s: FX "lineTo", x-11*s, y-20*s: FX "curveTo", x-13*s, y-46*s, x, y-62*s: FX "endFill"
6325 FX "beginFill", #d8dde2, 100: FX "moveTo", x-1.5*s, y-24*s: FX "lineTo", x+1.5*s, y-24*s: FX "lineTo", x+1.5*s, y: FX "lineTo", x-1.5*s, y: FX "endFill"
6330 LET cx=x: LET cy=y-38*s: LET rx=4*s: LET ry=4*s: LET bcol=#9fe4ff: GO SUB 6020: RETURN
6400 REM ---- a robed figure: feet at (x,y), height h, robe colour robe ----
6405 FX "lineStyle", 1.5, #120a18, 100: FX "beginFill", robe, 100: FX "moveTo", x, y-h: FX "lineTo", x+h*0.32, y: FX "lineTo", x-h*0.32, y: FX "lineTo", x, y-h: FX "endFill"
6410 LET cx=x: LET cy=y-h*0.78: LET rx=h*0.1: LET ry=h*0.11: LET bcol=#e0b090: GO SUB 6020: RETURN
6500 REM ---- n stars, scattered over the sky ----
6505 FX "lineStyle", 1, #ffffff, 90: FOR q=1 TO n: LET sx=RND*256: LET sy=RND*84: FX "moveTo", sx, sy: FX "lineTo", sx+1, sy: NEXT q: RETURN
6600 REM ---- the picture's frame: a thick black border, like a printed plate ----
6605 FX "lineStyle", 4, #000000, 100: FX "moveTo", 1, 1: FX "lineTo", 255, 1: FX "lineTo", 255, 87: FX "lineTo", 1, 87: FX "lineTo", 1, 1
6610 FX "lineStyle", 1, #e8c87a, 100: FX "moveTo", 4, 4: FX "lineTo", 252, 4: FX "lineTo", 252, 84: FX "lineTo", 4, 84: FX "lineTo", 4, 4: RETURN
7100 REM ======================== picture 1: your quarters, with Saturn in the porthole ========================
7105 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#1d3b44: GO SUB 6000: LET by=68: LET bh=20: LET bcol=#122429: GO SUB 6000
7110 FX "lineStyle", 4, #8a9aa0, 100: LET cx=150: LET cy=36: LET rx=30: LET ry=28: LET bcol=#e07a2e: GO SUB 6020
7115 LET cx=158: LET cy=34: LET rr=8: GO SUB 6200
7120 FX "lineStyle", 1.5, #120a18, 100: LET bx=10: LET by=52: LET bw=70: LET bh=10: LET bcol=#6b4e3a: GO SUB 6000: LET bx=12: LET by=46: LET bw=18: LET bh=6: LET bcol=#d8d0c0: GO SUB 6000
7125 LET bx=96: LET by=56: LET bw=26: LET bh=16: LET bcol=#8a3324: GO SUB 6000: LET bx=204: LET by=58: LET bw=40: LET bh=4: LET bcol=#5a4030: GO SUB 6000
7130 IF oloc(1)=1 THEN LET bx=216: LET by=54: LET bw=12: LET bh=4: LET bcol=#f2d24a: GO SUB 6000
7135 RETURN
7200 REM ======================== picture 2: the concourse under the great dome ========================
7205 LET r1=150: LET g1=55: LET b1=30: LET r2=242: LET g2=165: LET b2=65: LET hz=70: GO SUB 6100
7210 LET cx=204: LET cy=22: LET rr=11: GO SUB 6200
7215 FX "lineStyle", 2, #cfe8f0, 70: LET cx=128: LET cy=88: LET rx=150: LET ry=86: LET s0=4: LET s1=8: GO SUB 6040
7220 FOR q=1 TO 7: LET a=PI+q*PI/8: FX "moveTo", 128, 88: FX "lineTo", 128+150*COS a, 88+86*SIN a: NEXT q
7225 FX "lineStyle": LET bx=0: LET by=70: LET bw=256: LET bh=18: LET bcol=#3a2c3e: GO SUB 6000
7230 FX "lineStyle", 1.5, #120a18, 100: FOR q=0 TO 3: LET bx=150+q*24: LET by=52: LET bw=20: LET bh=18: LET bcol=#5a4a5e: GO SUB 6000: NEXT q
7235 LET bx=28: LET by=34: LET bw=44: LET bh=30: LET bcol=#10203a: GO SUB 6000: LET cx=50: LET cy=46: LET rx=9: LET ry=9: LET bcol=#3f8fd0: GO SUB 6020
7240 FX "lineStyle": LET cx=47: LET cy=44: LET rx=4: LET ry=3: LET bcol=#4fae5a: GO SUB 6020: PRINT AT 7,4; INK 6; "EARTH": RETURN
7300 REM ======================== picture 3: the Administrator's hall, and the red eye ========================
7305 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#1a1622: GO SUB 6000
7310 FX "lineStyle", 1.5, #120a18, 100: FOR q=0 TO 7: LET bx=4+q*32: LET by=14: LET bw=28: LET bh=60: LET bcol=#3c3a48: GO SUB 6000
7315 IF q<>3 AND q<>4 THEN LET cx=bx+8: LET cy=26: LET rx=5: LET ry=5: LET bcol=#d8d8e0: GO SUB 6020: LET cx=bx+20: GO SUB 6020
7320 NEXT q
7325 LET bx=98: LET by=12: LET bw=60: LET bh=46: LET bcol=#2a2a34: GO SUB 6000
7330 LET cx=128: LET cy=34: LET rx=17: LET ry=17: LET bcol=#5a0808: GO SUB 6020: LET rx=11: LET ry=11: LET bcol=#e02020: GO SUB 6020: FX "lineStyle": LET rx=4: LET ry=4: LET bcol=#ffd0d0: GO SUB 6020
7335 FOR q=1 TO 24: LET bx=8+RND*240: LET by=44+RND*26: LET bw=2: LET bh=2: LET bcol=#40ff60: IF RND<0.5 THEN LET bcol=#ffb020
7340 GO SUB 6000: NEXT q: RETURN
7400 REM ======================== picture 4: the departure lounge, and HOMEWARD on its pad ========================
7405 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#2b2630: GO SUB 6000
7410 LET r1=160: LET g1=60: LET b1=30: LET r2=240: LET g2=160: LET b2=70: LET hz=60: GO SUB 6100
7415 LET x=180: LET y=58: LET s=0.75: LET body=#f0f0f0: LET flame=0: GO SUB 6300
7420 FX "lineStyle": FOR q=1 TO 4: LET cx=160+q*10: LET cy=58-q*3: LET rx=8: LET ry=5: FX "beginFill", #e8e8e8, 40: LET s0=0: LET s1=8: GO SUB 6040: FX "endFill": NEXT q
7425 LET bx=0: LET by=60: LET bw=256: LET bh=28: LET bcol=#3a3040: GO SUB 6000
7430 FOR q=0 TO 5: LET x=90+q*16: LET y=86: LET h=26: LET robe=#1a1420: GO SUB 6400: NEXT q
7435 IF gave=0 THEN LET x=34: LET y=86: LET h=20: LET robe=#7a5a3a: GO SUB 6400
7440 RETURN
7500 REM ======================== picture 5: the dying garden, Vega among the beans ========================
7505 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#142a1c: GO SUB 6000
7510 FOR q=0 TO 3: LET cx=32+q*64: LET cy=6: LET rx=40: LET ry=16: FX "beginFill", #b060ff, 22: LET s0=0: LET s1=8: GO SUB 6040: FX "endFill": NEXT q
7515 FX "lineStyle", 1, #120a18, 100: FOR q=0 TO 22: LET x=8+q*11: LET y=70+(q-2*INT (q/2))*6: LET bcol=#6a7a2a: IF q-3*INT (q/3)=0 THEN LET bcol=#8a5a2a
7520 FX "beginFill", bcol, 100: FX "moveTo", x, y: FX "lineTo", x+4, y-18-RND*8: FX "lineTo", x+8, y: FX "endFill": NEXT q
7525 LET x=196: LET y=84: LET h=46: LET robe=#4a2a7a: GO SUB 6400: FX "lineStyle": FOR q=1 TO 8: LET bx=184+RND*24: LET by=46+RND*34: LET bw=2: LET bh=2: LET bcol=#ffe060: GO SUB 6000: NEXT q
7530 FX "lineStyle", 1.5, #120a18, 100: LET bx=60: LET by=76: LET bw=44: LET bh=10: LET bcol=#4a3020: GO SUB 6000
7535 FX "beginFill", #ffe060, 100: FX "moveTo", 82, 77: FX "lineTo", 84, 81: FX "lineTo", 88, 81: FX "lineTo", 85, 83: FX "lineTo", 86, 86: FX "lineTo", 82, 84: FX "lineTo", 78, 86: FX "lineTo", 79, 83: FX "lineTo", 76, 81: FX "lineTo", 80, 81: FX "lineTo", 82, 77: FX "endFill": RETURN
7600 REM ======================== picture 6: the airlock ========================
7605 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#3a4048: GO SUB 6000
7610 FX "lineStyle", 2, #120a18, 100: LET cx=150: LET cy=42: LET rx=32: LET ry=32: LET bcol=#5a646e: GO SUB 6020: LET rx=24: LET ry=24: LET bcol=#7a8690: GO SUB 6020
7615 FX "lineStyle", 3, #c8a050, 100: LET rx=10: LET ry=10: LET s0=0: LET s1=8: GO SUB 6040: FOR q=0 TO 3: LET a=q*PI/4: FX "moveTo", 150-14*COS a, 42-14*SIN a: FX "lineTo", 150+14*COS a, 42+14*SIN a: NEXT q
7620 IF oloc(4)=6 THEN FX "lineStyle", 1.5, #120a18, 100: LET bx=36: LET by=36: LET bw=30: LET bh=34: LET bcol=#e8e8e8: GO SUB 6000: FX "beginFill", #bfe8ff, 60: LET cx=51: LET cy=26: LET rx=13: LET ry=13: LET s0=0: LET s1=8: GO SUB 6040: FX "endFill"
7625 FX "lineStyle": FOR q=0 TO 15: LET bx=q*16: LET by=78: LET bw=8: LET bh=10: LET bcol=#e8c020: GO SUB 6000: NEXT q: RETURN
7700 REM ======================== picture 7: the methane shore, with Saturn filling the sky ========================
7705 LET r1=150: LET g1=50: LET b1=25: LET r2=240: LET g2=160: LET b2=64: LET hz=54: GO SUB 6100
7710 LET cx=176: LET cy=26: LET rr=20: GO SUB 6200
7715 FX "lineStyle": LET bx=0: LET by=54: LET bw=256: LET bh=20: LET bcol=#10141c: GO SUB 6000: FX "lineStyle", 1, #d06a30, 60: FOR q=1 TO 7: LET sx=RND*230: LET sy=57+RND*14: FX "moveTo", sx, sy: FX "lineTo", sx+20, sy: NEXT q
7720 FX "lineStyle": LET bx=0: LET by=74: LET bw=256: LET bh=14: LET bcol=#c8b89a: GO SUB 6000
7725 FX "lineStyle", 1, #fff0e0, 35: FOR q=1 TO 30: LET sx=RND*256: LET sy=RND*80: FX "moveTo", sx, sy: FX "lineTo", sx-3, sy+8: NEXT q: RETURN
7800 REM ======================== picture 8: the ice cliffs, and the dead rover ========================
7805 LET r1=140: LET g1=50: LET b1=30: LET r2=235: LET g2=150: LET b2=70: LET hz=70: GO SUB 6100
7810 FX "lineStyle", 1.5, #120a18, 100: FX "beginFill", #cfe6f2, 100: FX "moveTo", 0, 80: FX "lineTo", 0, 14: FX "lineTo", 30, 8: FX "lineTo", 52, 30: FX "lineTo", 80, 6: FX "lineTo", 104, 34: FX "lineTo", 128, 22: FX "lineTo", 150, 48: FX "lineTo", 150, 80: FX "endFill"
7815 FX "beginFill", #8fb0c8, 100: FX "moveTo", 30, 8: FX "lineTo", 52, 30: FX "lineTo", 40, 70: FX "lineTo", 24, 40: FX "endFill": FX "beginFill", #8fb0c8, 100: FX "moveTo", 80, 6: FX "lineTo", 104, 34: FX "lineTo", 92, 72: FX "lineTo", 76, 36: FX "endFill"
7820 FX "lineStyle": LET bx=0: LET by=72: LET bw=256: LET bh=16: LET bcol=#e8f4f8: GO SUB 6000
7825 FX "lineStyle", 1.5, #120a18, 100: LET bx=170: LET by=52: LET bw=60: LET bh=18: LET bcol=#b0a040: GO SUB 6000: LET bx=196: LET by=42: LET bw=24: LET bh=10: GO SUB 6000
7830 LET bcol=#2a2a2a: LET cy=72: LET rx=7: LET ry=7: LET cx=180: GO SUB 6020: LET cx=220: GO SUB 6020: IF oloc(5)=8 THEN FX "lineStyle": LET bx=186: LET by=56: LET bw=8: LET bh=8: LET bcol=#40ff80: GO SUB 6000
7835 RETURN
7900 REM ======================== picture 9: the Astra chapel ========================
7905 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#1a0f2e: GO SUB 6000
7910 LET n=50: GO SUB 6500: LET cx=60: LET cy=26: LET rr=12: GO SUB 6200
7915 FX "lineStyle", 2, #120a18, 100: LET cx=128: LET cy=80: LET rx=20: LET ry=34: LET bcol=#05030a: LET s0=4: LET s1=8: FX "beginFill", bcol, 100: GO SUB 6040: FX "endFill"
7920 FOR q=0 TO 2: LET x=180+q*24: LET y=86: LET h=38+q*4: LET robe=#5a3a8a: GO SUB 6400: NEXT q
7925 FX "lineStyle": FOR q=0 TO 2: LET cx=40+q*20: LET cy=70: LET rx=8: LET ry=8: FX "beginFill", #ffd040, 25: LET s0=0: LET s1=8: GO SUB 6040: FX "endFill": LET rx=1.5: LET ry=3: LET bcol=#fff0b0: GO SUB 6020: NEXT q: RETURN
8000 REM ======================== picture 10: the hangar, and the seed-ship ASTRA ========================
8005 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#20232a: GO SUB 6000
8010 LET cx=128: LET cy=0: LET rx=46: LET ry=14: LET bcol=#e8902e: GO SUB 6020
8015 FX "beginFill", #fff0a0, 14: FX "moveTo", 20, 88: FX "lineTo", 100, 0: FX "lineTo", 116, 0: FX "lineTo", 40, 88: FX "endFill": FX "beginFill", #fff0a0, 14: FX "moveTo", 236, 88: FX "lineTo", 156, 0: FX "lineTo", 140, 0: FX "lineTo", 216, 88: FX "endFill"
8020 FX "lineStyle", 2, #5a6070, 100: FOR q=0 TO 5: FX "moveTo", 84, 14+q*12: FX "lineTo", 100, 20+q*12: NEXT q: FX "moveTo", 84, 10: FX "lineTo", 84, 86
8025 LET x=128: LET y=80: LET s=1.05: LET body=#d23a2a: LET flame=0: GO SUB 6300
8030 FX "lineStyle", 1.5, #120a18, 100: LET bx=196: LET by=58: LET bw=40: LET bh=24: LET bcol=#3c3a48: GO SUB 6000
8035 FOR q=1 TO 3: LET bcol=#802020: IF q<=fitted THEN LET bcol=#40ff60
8040 LET bx=196+q*9: LET by=64: LET bw=6: LET bh=6: GO SUB 6000: NEXT q: RETURN
8100 REM ======================== picture 11: the archive ========================
8105 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#2a2420: GO SUB 6000
8110 FX "lineStyle", 1, #120a18, 100: FOR q=0 TO 3: LET bx=8: LET by=14+q*18: LET bw=170: LET bh=4: LET bcol=#7a5a3a: GO SUB 6000
8115 FOR k=0 TO 13: LET cx=16+k*12: LET cy=by-5: LET rx=5: LET ry=5: LET bcol=#c8c0b0: GO SUB 6020: NEXT k: NEXT q
8120 LET bx=196: LET by=10: LET bw=48: LET bh=74: LET bcol=#6a7480: GO SUB 6000: LET bx=202: LET by=40: LET bw=36: LET bh=12: LET bcol=#4a5460: GO SUB 6000: RETURN
8200 REM ======================== picture 12: the maintenance tunnel (dark, unless you carry the lamp) ========================
8205 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#020204: GO SUB 6000: IF oloc(3)<>0 THEN RETURN
8210 LET cx=128: LET cy=44: LET rx=110: LET ry=40: FX "beginFill", #f0c060, 20: LET s0=0: LET s1=8: GO SUB 6040: FX "endFill"
8215 FX "lineStyle", 4, #5a5040, 100: FOR q=0 TO 3: FX "moveTo", 30, 18+q*16: FX "lineTo", 226, 22+q*15: NEXT q
8220 FX "lineStyle", 1, #c8a050, 100: FOR q=0 TO 5: LET sx=40+q*34: FX "moveTo", sx, 10: FX "lineTo", sx, 78: NEXT q: RETURN
8300 REM ======================== picture 13: the core, and the brass heart ========================
8305 FX "lineStyle": LET bx=0: LET by=0: LET bw=256: LET bh=88: LET bcol=#06080f: GO SUB 6000
8310 LET cx=128: LET cy=44: LET rx=60: LET ry=40: FX "beginFill", #c8a050, 12: LET s0=0: LET s1=8: GO SUB 6040: FX "endFill"
8315 FX "lineStyle", 1.5, #c8a050, 100: FOR q=1 TO 4: LET rx=q*14: LET ry=q*10: LET s0=0: LET s1=8: GO SUB 6040: NEXT q
8320 FX "lineStyle", 1, #120a18, 100: FOR q=0 TO 11: LET a=q*PI/6: LET cx=128+64*COS a: LET cy=44+40*SIN a: LET rx=4: LET ry=6: LET bcol=#ff8a2a: GO SUB 6020: NEXT q
8325 IF cubefree=0 OR oloc(7)=13 THEN FX "lineStyle", 1.5, #120a18, 100: LET bx=118: LET by=34: LET bw=20: LET bh=20: LET bcol=#d8b050: GO SUB 6000: LET bx=120: LET by=36: LET bw=6: LET bh=6: LET bcol=#fff0b0: GO SUB 6000
8330 RETURN
9000 REM ======================== the places: name, words, and the ways out (north, south, east, west, up, down) ========================
9010 DATA "YOUR QUARTERS","A narrow cabin in New Hope Dome. Through the porthole, ringed Saturn hangs in a sky the colour of rust. Your bags are packed, as the Administrator advised.",0,2,0,0,0,0
9020 DATA "THE CONCOURSE","Under the great glass dome the shops stand shuttered. A poster glows: EARTH IS CALLING. Stairs lead up; a grating leads down.",1,4,3,5,11,12
9030 DATA "THE ADMINISTRATOR'S HALL","Cabinets hum and tape reels spin. In the middle, a great red eye regards you without blinking.",0,0,0,2,0,0
9040 DATA "DEPARTURE LOUNGE","Colonists queue with their lives in suitcases. Beyond the glass the shuttle HOMEWARD steams on its pad. An old miner sits apart.",2,0,0,0,0,0
9050 DATA "THE HYDROPONIC GARDEN","Grow-lamps buzz over rows of dying beans. A woman in a robe painted with stars kneels among them. In the floor, a trapdoor.",0,6,2,0,0,9
9060 DATA "THE AIRLOCK","A round steel hatch with a wheel lock. Beyond it, the surface of Titan: a hundred and eighty degrees below zero.",5,0,7,0,0,0
9070 DATA "THE METHANE SHORE","Black waves of liquid methane lap at a beach of ice pebbles. Saturn fills the orange sky. Rain falls slowly, like snow in a dream.",8,0,0,6,0,0
9080 DATA "THE ICE CLIFFS","Cliffs of ancient water ice, hard as granite, tower over the wreck of a mining rover, half buried in drifts.",0,7,0,0,0,0
9090 DATA "THE ASTRA CHAPEL","A cellar painted with stars from floor to ceiling. Robed Astras hum a slow hymn by candlelight. A tunnel leads north.",10,0,0,0,5,0
9100 DATA "THE HANGAR","In an old mining silo stands the seed-ship ASTRA, a fat red rocket on silver fins, aimed at a hole in the sky. A console waits by the hatch.",0,9,0,0,0,0
9110 DATA "THE ARCHIVE","Shelves of punched-tape reels: the memory of the colony, crated for Earth. A tall steel cabinet stands in the corner.",0,0,0,0,0,2
9120 DATA "MAINTENANCE TUNNEL","Pipes sweat and tick in the lamplight. The tunnel runs east, towards a deep humming.",0,0,13,0,2,0
9130 DATA "THE CORE","The heart of the Administrator: a cage of glowing valves, and at its centre a small brass cube that sings faintly to itself.",0,0,0,12,0,0
9200 REM ======================== the things: name, what you see when you examine it, where it starts (-1 means nowhere yet) ========================
9210 DATA "a ticket","One way to Earth aboard HOMEWARD. Seat 9.",1
9220 DATA "a star pendant","A silver star on a cord, warm as a hand.",-1
9230 DATA "a miner's lamp","An old brass lamp. Its light is the colour of honey.",-1
9240 DATA "a pressure suit","A suit with a fishbowl helmet, like the ones on magazine covers.",6
9250 DATA "a fuel cell","Heavy and warm. The gauge reads FULL.",8
9260 DATA "a reel of tape","Punched tape. Holding it to the light, you see the pattern of the nearer stars.",-1
9270 DATA "a brass cube","Warm, humming, and engraved: ADMINISTRATOR - CORE MEMORY.",-1
9280 DATA "an algae biscuit","GENUINE ALGAE BISCUIT. TASTES LIKE THE SEA.",1
9300 REM ======================== the words for the things ========================
9310 DATA "ticket",1,"pass",1,"pendant",2,"star",2,"lamp",3,"torch",3,"lantern",3,"suit",4,"spacesuit",4,"cell",5,"fuel",5
9320 DATA "tape",6,"reel",6,"chart",6,"cube",7,"heart",7,"biscuit",8,"ration",8,"food",8
9350 DATA "north","south","east","west","up","down"
` },
  { id: 'lisp', name: 'Lisp on an ADM-3A (with toy RDF)', src: `5 REM touch:
10 REM ======================== LISP ON AN ADM-3A ========================
20 REM A small Lisp, written in plain ZX Spectrum BASIC, running on a drawn ADM-3A terminal.
30 REM Memory is a heap of cells in three arrays: t() the type, a() and d() the two halves
40 REM (car and cdr for a pair). NIL is 0. Types: 1 pair, 2 symbol, 3 number, 4 built-in, 5 function.
50 REM BASIC has no local variables, so the evaluator keeps its own stack in k().
60 REM Most of the language (MAPCAR, APPEND, EQUAL...) is written in Lisp at the end, and loaded at start.
70 REM Then a toy RDF store: triples about the characters in this collection, a query
80 REM language of SPARQL-style basic graph patterns with ?VARIABLES, and RDFS-style rules. Type (DEMO).
90 REM   100 setup  3000 the terminal  4000 read-eval-print  5000 the screen  6000 reader  6500 printer
95 REM   7000 evaluator  8000 cells  8100 built-ins  8400 globals  8450 symbols  8500 garbage  9000 words
100 REM ======================== setup ========================
110 GO SUB 3000
120 LET cells=6000: DIM t(cells): DIM a(cells): DIM d(cells): DIM b(cells): DIM k(9000): DIM s$(160,16): DIM y(160): DIM w$(13,26): DIM h$(60,200)
130 REM every cell starts on the free list, chained through d()
135 LET fr=0: FOR i=cells TO 1 STEP -1: LET d(i)=fr: LET fr=i: NEXT i: LET free=cells
140 LET nsym=0: LET g=0: LET sp=0: LET er=0: LET tr=0: LET tc=0: LET v$="": LET r$="": LET blink=0: LET lit=0: LET lr=0
145 LET ec=0: LET sn=0: LET sf=0: LET sg=0: LET ra=0: LET q$="|/-\\": EMOJI "⏲️","timer",32
150 REM the words the evaluator treats specially
155 RESTORE 9000: FOR i=1 TO 12: READ n$: GO SUB 8450: LET k(i)=rv: NEXT i
160 LET symquote=k(1): LET symif=k(2): LET symcond=k(3): LET symdefun=k(4): LET symsetq=k(5): LET symlambda=k(6)
165 LET symprogn=k(7): LET symand=k(8): LET symor=k(9): LET symlet=k(10): LET symt=k(11): LET symdefp=k(12)
170 REM the built-in functions: each is a cell of type 4 holding its number, bound to its name
175 RESTORE 9010: FOR i=1 TO 23: READ n$,bn: GO SUB 8450: LET sm=rv: LET ty=4: LET p1=bn: LET p2=0: GO SUB 8000: LET vl=nw: GO SUB 8400: NEXT i
180 LET o$="LISP FOR THE ADM-3A": GO SUB 5100: LET o$="LOADING THE PRELUDE ": GO SUB 4900
182 REM the examples the cursor keys bring back, before any lines of your own
183 RESTORE 9200: LET nh=0
184 READ n$: IF n$<>"END" THEN LET nh=nh+1: LET h$(nh)=n$: GO TO 184
185 LET ne=nh: LET hi=nh+1: REM the rest of the language, written in Lisp
190 RESTORE 9100
191 READ l$: IF l$="END" THEN GO TO 196
192 LET ps=1: LET er=0: LET sp=0: GO SUB 6000: IF er THEN GO TO 194
193 LET ex=rv: LET en=0: GO SUB 7000
194 IF er THEN LET o$="PRELUDE: "+e$: GO SUB 5100
195 LET c$=".": GO SUB 5000: GO TO 191
196 GO SUB 5050: GO SUB 8500: LET o$=STR$ free+" CELLS FREE.": GO SUB 5100
197 LET o$="TYPE (DEMO) OR (HELP), OR": GO SUB 5100: LET o$="UP AND DOWN FOR EXAMPLES.": GO SUB 5100
198 GO TO 4000
3000 REM ======================== the terminal: an ADM-3A, made of PAPER squares and drawn lines ========================
3005 BORDER 0: PAPER 0: INK 7: BRIGHT 0: CLS
3010 FOR r=0 TO 21: PRINT AT r,0; PAPER 7; "                                ": NEXT r
3015 REM the glass: a black window in the case
3020 FOR r=1 TO 15: PRINT AT r,2; PAPER 0; "                            ": NEXT r
3025 REM the glass sits in a recess: a shadow above and to the left, a highlight below and to the right
3030 PLOT INK 0;13,170: DRAW INK 0;229,0: PLOT INK 0;13,170: DRAW INK 0;0,-125
3035 PLOT INK 0;14,169: DRAW INK 0;227,0: PLOT INK 0;14,169: DRAW INK 0;0,-123
3045 REM round the corners of the glass, a few pixels at a time
3050 FOR i=0 TO 3: PLOT INK 7;16,164+i: DRAW INK 7;i,0: PLOT INK 7;239,164+i: DRAW INK 7;-i,0: PLOT INK 7;16,51-i: DRAW INK 7;i,0: PLOT INK 7;239,51-i: DRAW INK 7;-i,0: NEXT i
3065 REM the badge and the power lamp
3070 PRINT AT 16,2; PAPER 7; INK 0; "ADM-3A": PRINT AT 16,24; PAPER 7; INK 0; "ON": PRINT AT 16,27; PAPER 7; INK 2; CHR$ 143
3075 PLOT INK 0;0,39: DRAW INK 0;255,0
3080 REM the keyboard: dark keys on the light case; each letter is printed on its key
3085 RESTORE 9050: READ f$,g$,k$,j$: REM the keyboard rows (k$, not h$: h$ is the line history, and arrays share names with scalars)
3090 LET z$=f$: LET r=17: LET c=4: GO SUB 3150
3095 LET z$=g$: LET r=18: LET c=5: GO SUB 3150
3100 LET z$=k$: LET r=19: LET c=6: GO SUB 3150
3105 LET z$=j$: LET r=20: LET c=7: GO SUB 3150
3110 PRINT AT 21,9; PAPER 0; INK 7; "              "
3115 PRINT AT 18,26; PAPER 0; INK 7; "RET"
3120 REM from now on: green phosphor
3125 INK 4: PAPER 0: BRIGHT 1: RETURN
3150 FOR i=1 TO LEN z$: IF z$(i)<>" " THEN PRINT AT r,c+i-1; PAPER 0; INK 7; z$(i)
3155 NEXT i: RETURN
3500 REM ---- light up the key just typed, and put the last one back ----
3505 IF lr>0 THEN PRINT AT lr,lc; PAPER 0; INK 7; BRIGHT 0; x$
3510 LET lr=0: LET z$=f$: LET r=17: LET c=4: GO SUB 3550: LET z$=g$: LET r=18: LET c=5: GO SUB 3550
3515 LET z$=k$: LET r=19: LET c=6: GO SUB 3550: LET z$=j$: LET r=20: LET c=7: GO SUB 3550
3520 IF lr>0 THEN PRINT AT lr,lc; PAPER 4; INK 0; BRIGHT 1; x$
3525 RETURN
3550 FOR i=1 TO LEN z$: IF z$(i)=c$ AND c$<>" " THEN LET lr=r: LET lc=c+i-1: LET x$=c$
3555 NEXT i: RETURN
3600 REM ---- busy: while it works, a timer spins and throbs on the case, a spinner turns where the answer will go, and the power lamp flickers ----
3602 REM the evaluator comes here every 40 calls; the timer moves once a frame, the spinner every 6 frames, timed by FRAMES, however fast it runs
3605 LET ec=0: LET nl=PEEK 23672: IF nl=sg THEN RETURN
3606 LET sg=nl: LET ra=ra+8: IF ra>=360 THEN LET ra=ra-360
3607 LET sz=72+10*SIN (ra*PI/90): SPRITE CLEAR: SPRITE "timer",238,163,sz,sz,ra,100
3608 IF ABS (nl-sf)<6 THEN RETURN
3610 LET sf=nl: LET sn=sn+1: IF sn=4 THEN LET sn=0
3615 IF tc<26 THEN PRINT AT 2+tr,3+tc; q$(sn+1)
3620 IF sn<2 THEN PRINT AT 16,27; PAPER 7; INK 4; BRIGHT 0; CHR$ 143: RETURN
3625 PRINT AT 16,27; PAPER 7; INK 2; BRIGHT 0; CHR$ 143: RETURN
4000 REM ======================== read, evaluate, print: one line at a time, more if a bracket is still open ========================
4005 SPRITE CLEAR: PRINT AT 16,27; PAPER 7; INK 2; BRIGHT 0; CHR$ 143: LET l$="": LET depth=0: LET pr=tr: LET o$="* ": GO SUB 4900
4010 GO SUB 4500
4015 IF c$=CHR$ 13 THEN GO TO 4100
4020 IF c$=CHR$ 8 OR c$=CHR$ 12 THEN GO TO 4200
4022 IF c$=CHR$ 11 THEN GO TO 4400
4023 IF c$=CHR$ 10 THEN GO TO 4415
4025 IF CODE c$<32 OR CODE c$>126 THEN GO TO 4010
4030 IF CODE c$>=97 AND CODE c$<=122 THEN LET c$=CHR$ (CODE c$-32)
4035 IF c$="(" THEN LET depth=depth+1
4040 IF c$=")" THEN LET depth=depth-1
4045 LET l$=l$+c$: GO SUB 5000: GO SUB 3500: GO TO 4010
4100 REM Enter: if a bracket is still open, carry on on the next line
4105 GO SUB 5050: IF depth>0 THEN LET l$=l$+" ": LET o$="  ": GO SUB 4900: GO TO 4010
4107 IF l$<>"" THEN IF l$<>h$(nh) THEN GO SUB 4470
4108 LET hi=nh+1
4110 LET ps=1
4115 GO SUB 6090: IF ps>LEN l$ THEN GO TO 4300
4120 LET er=0: LET sp=0: GO SUB 6000: IF er THEN GO TO 4250
4125 LET ex=rv: LET en=0: GO SUB 7000: IF er THEN GO TO 4250
4130 LET o$="": LET ob=rv: GO SUB 6500: GO SUB 5100: GO TO 4115
4200 REM rubbing out: only back along the line being typed
4205 IF LEN l$=0 OR tc=0 THEN GO TO 4010
4210 IF l$(LEN l$)="(" THEN LET depth=depth-1
4215 IF l$(LEN l$)=")" THEN LET depth=depth+1
4220 LET l$=l$(1 TO LEN l$-1): LET v$=v$(1 TO LEN v$-1): LET tc=tc-1: PRINT AT 2+tr,3+tc; " ": GO TO 4010
4250 LET o$="ERROR: "+e$: GO SUB 5100
4300 IF free<900 THEN GO SUB 8500
4310 GO TO 4000
4400 REM ---- up and down: your earlier lines, then the examples; each comes back typed in, ready to edit or run ----
4405 IF hi>1 THEN LET hi=hi-1: GO TO 4420
4410 GO TO 4010
4415 IF hi<nh THEN LET hi=hi+1: GO TO 4420
4416 IF hi=nh THEN LET hi=nh+1: LET n$="": GO TO 4425
4417 GO TO 4010
4420 LET n$=h$(hi)
4425 REM rub out every row of the line being typed (pr is the row its prompt is on), and prompt again there
4430 IF pr<0 THEN LET pr=0
4435 FOR j=pr TO tr: PRINT AT 2+j,3;"                          ": LET w$(j+1)="": NEXT j: LET tr=pr: LET tc=0: LET v$="": LET o$="* ": GO SUB 4900
4440 LET l$="": LET depth=0: LET o$=n$: GO SUB 4900: LET l$=n$
4445 FOR j=1 TO LEN l$: IF l$(j)="(" THEN LET depth=depth+1
4446 IF l$(j)=")" THEN LET depth=depth-1
4447 NEXT j: GO TO 4010
4470 REM keep a line typed in; when the list is full the oldest of your own goes
4475 IF nh=60 THEN FOR j=ne+1 TO 59: LET h$(j)=h$(j+1): NEXT j: LET nh=59
4480 LET nh=nh+1: LET h$(nh)=l$: RETURN
4500 REM ---- wait for a key to go down; the cursor blinks meanwhile ----
4502 REM the cursor blinks by the FRAMES counter (PEEK 23672 counts 50ths of a second)
4505 LET nl=INT (PEEK 23672/16)-2*INT (PEEK 23672/32): IF nl<>lit THEN LET lit=nl: IF tc<26 THEN PRINT AT 2+tr,3+tc; CHR$ (32+111*lit)
4510 LET c$=INKEY$: IF c$="" THEN LET r$="": PAUSE 1: GO TO 4505
4515 IF c$=r$ THEN PAUSE 1: GO TO 4505
4520 LET r$=c$: LET lit=0: IF tc<26 THEN PRINT AT 2+tr,3+tc; " "
4525 RETURN
4900 REM ---- o$ onto the screen, without a new line ----
4905 FOR j=1 TO LEN o$: LET c$=o$(j): GO SUB 5000: NEXT j: RETURN
5000 REM ======================== the screen: c$ at the cursor; a new line when the row is full ========================
5005 IF tc=26 THEN GO SUB 5050
5010 PRINT AT 2+tr,3+tc; c$: LET v$=v$+c$: LET tc=tc+1: RETURN
5050 REM a new line: keep the finished one; at the bottom, every line moves up
5055 LET w$(tr+1)=v$: LET v$="": LET tc=0: IF tr<12 THEN LET tr=tr+1: RETURN
5060 LET pr=pr-1: FOR i=1 TO 12: LET w$(i)=w$(i+1): NEXT i: LET w$(13)=""
5065 FOR i=1 TO 13: LET z$=w$(i)+"                          ": PRINT AT 1+i,3; z$(1 TO 26): NEXT i: RETURN
5100 REM ---- o$ onto the screen, then a new line ----
5105 GO SUB 4900: GO SUB 5050: RETURN
6000 REM ======================== the reader: one expression from l$ at position ps; it comes back in rv ========================
6005 GO SUB 6090: IF ps>LEN l$ THEN LET er=1: LET e$="UNEXPECTED END": RETURN
6010 LET c$=l$(ps)
6015 IF c$="'" THEN LET ps=ps+1: GO SUB 6000: LET ty=1: LET p1=rv: LET p2=0: GO SUB 8000: LET ty=1: LET p1=symquote: LET p2=nw: GO SUB 8000: LET rv=nw: RETURN
6020 IF c$="(" THEN GO TO 6100
6025 IF c$=")" THEN LET ps=ps+1: LET er=1: LET e$="UNEXPECTED )": RETURN
6030 REM an atom: a number, NIL, or a symbol
6035 LET n$=""
6040 IF ps<=LEN l$ THEN LET c$=l$(ps): IF c$<>" " AND c$<>"(" AND c$<>")" AND c$<>"'" THEN LET n$=n$+c$: LET ps=ps+1: GO TO 6040
6045 IF n$="NIL" THEN LET rv=0: RETURN
6050 GO SUB 6070: IF isnum THEN LET ty=3: LET p1=VAL n$: LET p2=0: GO SUB 8000: LET rv=nw: RETURN
6055 GO SUB 8450: RETURN
6070 REM is n$ a number? digits, perhaps a point, perhaps a minus sign in front
6072 LET isnum=1: FOR i=1 TO LEN n$: LET u=CODE n$(i): IF (u<48 OR u>57) AND u<>46 AND NOT (i=1 AND u=45 AND LEN n$>1) THEN LET isnum=0
6074 NEXT i: RETURN
6090 IF ps<=LEN l$ THEN IF l$(ps)=" " THEN LET ps=ps+1: GO TO 6090
6095 RETURN
6100 REM a list: read each item in turn, and chain them together
6105 LET ps=ps+1: LET hd=0: LET tl=0
6110 GO SUB 6090: IF ps>LEN l$ THEN LET er=1: LET e$="MISSING )": RETURN
6115 IF l$(ps)=")" THEN LET ps=ps+1: LET rv=hd: RETURN
6120 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: GO SUB 6000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
6125 LET ty=1: LET p1=rv: LET p2=0: GO SUB 8000
6130 IF hd=0 THEN LET hd=nw
6135 IF tl<>0 THEN LET d(tl)=nw
6140 LET tl=nw: GO TO 6110
6500 REM ======================== the printer: the object ob, written onto the end of o$ ========================
6505 IF LEN o$>500 THEN RETURN
6510 IF ob=0 THEN LET o$=o$+"NIL": RETURN
6515 IF t(ob)=3 THEN LET o$=o$+STR$ a(ob): RETURN
6520 IF t(ob)=2 THEN LET o$=o$+s$(a(ob)): RETURN
6525 IF t(ob)=4 THEN LET o$=o$+"#<BUILT-IN>": RETURN
6530 IF t(ob)=5 THEN LET o$=o$+"#<FUNCTION>": RETURN
6533 IF a(ob)=symquote THEN IF t(d(ob))=1 THEN IF d(d(ob))=0 THEN LET o$=o$+"'": LET ob=a(d(ob)): GO TO 6505
6535 LET o$=o$+"("
6540 LET sp=sp+1: LET k(sp)=ob: LET ob=a(ob): GO SUB 6500: LET ob=k(sp): LET sp=sp-1
6545 LET ob=d(ob): IF ob=0 THEN LET o$=o$+")": RETURN
6550 IF t(ob)<>1 THEN LET o$=o$+" . ": GO SUB 6500: LET o$=o$+")": RETURN
6555 LET o$=o$+" ": GO TO 6540
7000 REM ======================== the evaluator: the expression ex in the environment en; the value comes back in rv ========================
7002 REM around each call to itself, the evaluator saves its six working values on the stack k() and restores them
7003 REM afterwards, written out in full each time: on this machine a GO SUB costs more than the copying
7004 LET ec=ec+1: IF ec>40 THEN GO SUB 3600
7005 IF sp>3000 THEN LET er=1: LET e$="TOO DEEP"
7006 IF er THEN RETURN
7010 IF ex=0 THEN LET rv=0: RETURN
7015 IF t(ex)=2 THEN GO TO 7300
7020 IF t(ex)<>1 THEN LET rv=ex: RETURN
7025 LET op=a(ex)
7030 IF op=symquote THEN LET rv=a(d(ex)): RETURN
7035 IF op=symif THEN GO TO 7400
7040 IF op=symcond THEN GO TO 7450
7045 IF op=symdefun THEN GO TO 7500
7050 IF op=symsetq OR op=symdefp THEN GO TO 7550
7055 IF op=symlambda THEN LET ty=5: LET p1=d(ex): LET p2=en: GO SUB 8000: LET rv=nw: RETURN
7060 IF op=symprogn THEN LET rs=d(ex): GO TO 7650
7065 IF op=symand THEN GO TO 7700
7070 IF op=symor THEN GO TO 7750
7075 IF op=symlet THEN GO TO 7800
7080 REM a call: find the function, then work out each argument in turn
7085 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=op: GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): LET fu=rv: IF er THEN RETURN
7090 LET hd=0: LET tl=0: LET rs=d(ex)
7095 IF rs=0 THEN GO TO 7200
7100 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=a(rs): GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
7105 LET ty=1: LET p1=rv: LET p2=0: GO SUB 8000: IF er THEN RETURN
7110 IF hd=0 THEN LET hd=nw
7115 IF tl<>0 THEN LET d(tl)=nw
7120 LET tl=nw: LET rs=d(rs): GO TO 7095
7200 REM ---- applying the function fu to the arguments hd ----
7205 IF fu=0 THEN GO TO 7290
7210 IF t(fu)=4 THEN GO TO 8100
7215 IF t(fu)<>5 THEN GO TO 7290
7220 REM a function made by DEFUN or LAMBDA: pair each parameter with its argument, in front of the environment it was made in
7225 LET en=d(fu): LET rs=a(a(fu)): LET tl=hd
7230 IF rs=0 THEN GO TO 7260
7235 LET ty=1: LET p1=a(rs): LET p2=a(tl): GO SUB 8000: LET ty=1: LET p1=nw: LET p2=en: GO SUB 8000: LET en=nw
7240 LET rs=d(rs): LET tl=d(tl): GO TO 7230
7260 LET rs=d(a(fu)): GO TO 7650
7290 LET er=1: LET e$="NOT A FUNCTION": RETURN
7300 REM ---- a symbol: first the local environment, then the global one ----
7305 IF ex=symt THEN LET rv=ex: RETURN
7310 LET p=en
7315 IF p=0 THEN GO TO 7330
7320 IF a(a(p))=ex THEN LET rv=d(a(p)): RETURN
7325 LET p=d(p): GO TO 7315
7330 LET p=g
7335 IF p=0 THEN LET er=1: LET e$="UNBOUND "+s$(a(ex)): RETURN
7340 IF a(a(p))=ex THEN LET rv=d(a(p)): RETURN
7345 LET p=d(p): GO TO 7335
7400 REM ---- (IF test then else) ----
7405 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=a(d(ex)): GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
7410 IF rv<>0 THEN LET ex=a(d(d(ex))): GO TO 7000
7415 LET ex=a(d(d(d(ex)))): GO TO 7000
7450 REM ---- (COND (test body...) ...): the first clause whose test is true ----
7455 LET rs=d(ex)
7460 IF rs=0 THEN LET rv=0: RETURN
7465 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=a(a(rs)): GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
7470 IF rv=0 THEN LET rs=d(rs): GO TO 7460
7475 IF d(a(rs))=0 THEN RETURN
7480 LET rs=d(a(rs)): GO TO 7650
7500 REM ---- (DEFUN name (params) body...): a function, bound to its name ----
7505 LET ty=5: LET p1=d(d(ex)): LET p2=en: GO SUB 8000: IF er THEN RETURN
7510 LET sm=a(d(ex)): LET vl=nw: GO SUB 8400: LET rv=sm: RETURN
7550 REM ---- (SETQ name value): change the nearest binding, or make a global one ----
7555 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=a(d(d(ex))): GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
7560 LET sm=a(d(ex)): LET p=en
7565 IF p=0 THEN LET vl=rv: GO SUB 8400: RETURN
7570 IF a(a(p))=sm THEN LET d(a(p))=rv: RETURN
7575 LET p=d(p): GO TO 7565
7650 REM ---- a body: each expression in turn; the last one's value is the answer ----
7655 IF rs=0 THEN LET rv=0: RETURN
7660 IF d(rs)=0 THEN LET ex=a(rs): GO TO 7000
7665 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=a(rs): GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
7670 LET rs=d(rs): GO TO 7660
7700 REM ---- (AND ...): stop at the first false one ----
7705 LET rs=d(ex): LET rv=symt
7710 IF rs=0 THEN RETURN
7715 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=a(rs): GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
7720 IF rv=0 THEN RETURN
7725 LET rs=d(rs): GO TO 7710
7750 REM ---- (OR ...): stop at the first true one ----
7755 LET rs=d(ex): LET rv=0
7760 IF rs=0 THEN RETURN
7765 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=a(rs): GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
7770 IF rv<>0 THEN RETURN
7775 LET rs=d(rs): GO TO 7760
7800 REM ---- (LET ((name value) ...) body...): new bindings, then the body ----
7805 LET rs=a(d(ex)): LET hd=en
7810 IF rs=0 THEN GO TO 7840
7815 LET k(sp+1)=ex: LET k(sp+2)=en: LET k(sp+3)=fu: LET k(sp+4)=hd: LET k(sp+5)=tl: LET k(sp+6)=rs: LET sp=sp+6: LET ex=a(d(a(rs))): GO SUB 7000: LET sp=sp-6: LET ex=k(sp+1): LET en=k(sp+2): LET fu=k(sp+3): LET hd=k(sp+4): LET tl=k(sp+5): LET rs=k(sp+6): IF er THEN RETURN
7820 LET ty=1: LET p1=a(a(rs)): LET p2=rv: GO SUB 8000: LET ty=1: LET p1=nw: LET p2=hd: GO SUB 8000: LET hd=nw
7825 LET rs=d(rs): GO TO 7810
7840 LET en=hd: LET rs=d(d(ex)): GO TO 7650
8000 REM ======================== a new cell of type ty holding p1 and p2, taken from the free list; it comes back in nw ========================
8005 IF fr=0 THEN GO SUB 8500: IF fr=0 THEN LET er=1: LET e$="OUT OF CELLS": LET nw=0: RETURN
8010 LET nw=fr: LET fr=d(fr): LET t(nw)=ty: LET a(nw)=p1: LET d(nw)=p2: LET free=free-1: RETURN
8100 REM ======================== the built-in functions: number bn picks a line; the arguments are the list hd ========================
8105 LET bn=a(fu): LET x1=a(hd): LET x2=a(d(hd)): LET rv=0
8110 GO TO 8120+5*bn
8125 IF t(x1)=1 THEN LET rv=a(x1)
8126 RETURN
8130 IF t(x1)=1 THEN LET rv=d(x1)
8131 RETURN
8135 LET ty=1: LET p1=x1: LET p2=x2: GO SUB 8000: LET rv=nw: RETURN
8140 IF t(x1)<>1 THEN LET rv=symt
8141 RETURN
8145 GO SUB 8240: RETURN
8150 LET acc=0: LET p=hd
8151 IF p=0 THEN GO TO 8300
8152 LET x1=a(p): IF t(x1)<>3 THEN GO TO 8305
8153 LET acc=acc+a(x1): LET p=d(p): GO TO 8151
8155 IF t(x1)<>3 THEN GO TO 8305
8156 IF x2=0 THEN LET acc=-a(x1): GO TO 8300
8157 IF t(x2)<>3 THEN GO TO 8305
8158 LET acc=a(x1)-a(x2): GO TO 8300
8160 LET acc=1: LET p=hd
8161 IF p=0 THEN GO TO 8300
8162 LET x1=a(p): IF t(x1)<>3 THEN GO TO 8305
8163 LET acc=acc*a(x1): LET p=d(p): GO TO 8161
8165 IF t(x1)<>3 OR t(x2)<>3 THEN GO TO 8305
8166 IF a(x2)=0 THEN LET er=1: LET e$="DIVISION BY ZERO": RETURN
8167 LET acc=a(x1)/a(x2): GO TO 8300
8170 IF t(x1)<>3 OR t(x2)<>3 THEN GO TO 8305
8171 IF a(x1)<a(x2) THEN LET rv=symt
8172 RETURN
8175 IF t(x1)<>3 OR t(x2)<>3 THEN GO TO 8305
8176 IF a(x1)>a(x2) THEN LET rv=symt
8177 RETURN
8180 IF t(x1)<>3 OR t(x2)<>3 THEN GO TO 8305
8181 IF a(x1)=a(x2) THEN LET rv=symt
8182 RETURN
8185 LET rv=hd: RETURN
8190 IF x1=0 THEN LET rv=symt
8191 RETURN
8195 LET o$="": LET ob=x1: GO SUB 6500: GO SUB 5100: LET rv=x1: RETURN
8200 IF t(x1)=3 THEN LET rv=symt
8201 RETURN
8205 IF t(x1)=2 THEN LET rv=symt
8206 RETURN
8210 IF t(x1)<>2 THEN RETURN
8211 LET z$=s$(a(x1)): IF z$(1 TO 1)="?" THEN LET rv=symt
8212 RETURN
8215 LET acc=free: GO TO 8300
8220 GO TO 8260
8225 GO TO 8280
8230 GO TO 8290
8235 GO TO 8295
8240 REM EQ: the same cell, or two numbers that are equal
8241 IF x1=x2 THEN LET rv=symt: RETURN
8242 IF t(x1)=3 AND t(x2)=3 THEN IF a(x1)=a(x2) THEN LET rv=symt
8243 RETURN
8260 REM EQUAL: the same shape, with the same atoms; pairs still to compare wait on the stack above sp
8261 LET qs=sp: LET k(qs+1)=x1: LET k(qs+2)=x2: LET qs=qs+2: LET rv=symt
8262 IF qs=sp THEN RETURN
8263 LET y1=k(qs-1): LET y2=k(qs): LET qs=qs-2
8264 IF y1=y2 THEN GO TO 8262
8265 IF t(y1)=1 AND t(y2)=1 THEN LET k(qs+1)=a(y1): LET k(qs+2)=a(y2): LET k(qs+3)=d(y1): LET k(qs+4)=d(y2): LET qs=qs+4: GO TO 8262
8266 IF t(y1)=3 AND t(y2)=3 THEN IF a(y1)=a(y2) THEN GO TO 8262
8267 LET rv=0: RETURN
8280 REM ASSOC: the first (key . value) pair in a list whose key is x1
8281 LET p=x2
8282 IF p=0 THEN RETURN
8283 IF t(a(p))=1 THEN IF a(a(p))=x1 THEN LET rv=a(p): RETURN
8284 LET p=d(p): GO TO 8282
8290 REM MEMBER: the rest of the list from the first element EQUAL to x1
8291 LET ml=x2
8292 IF ml=0 THEN LET rv=0: RETURN
8293 LET x2=a(ml): GO SUB 8261: IF rv THEN LET rv=ml: RETURN
8294 LET ml=d(ml): GO TO 8292
8295 LET acc=0: LET p=x1: REM LENGTH
8296 IF p<>0 THEN LET acc=acc+1: LET p=d(p): GO TO 8296
8297 GO TO 8300
8300 LET ty=3: LET p1=acc: LET p2=0: GO SUB 8000: LET rv=nw: RETURN
8305 LET er=1: LET e$="NOT A NUMBER": RETURN
8400 REM ======================== the global environment: a list of (name . value) pairs; set sm to vl ========================
8405 LET p=g
8410 IF p=0 THEN GO TO 8430
8415 IF a(a(p))=sm THEN LET d(a(p))=vl: RETURN
8420 LET p=d(p): GO TO 8410
8430 LET ty=1: LET p1=sm: LET p2=vl: GO SUB 8000: LET ty=1: LET p1=nw: LET p2=g: GO SUB 8000: LET g=nw: RETURN
8450 REM ======================== symbols: each name is made once; n$ comes back as its symbol in rv ========================
8455 FOR m=1 TO nsym: IF s$(m)=n$ THEN LET rv=y(m): RETURN
8460 NEXT m
8465 LET nsym=nsym+1: LET s$(nsym)=n$: LET ty=2: LET p1=nsym: LET p2=0: GO SUB 8000: LET y(nsym)=nw: LET rv=nw: RETURN
8500 REM ======================== garbage: mark everything still in use, then sweep the rest back onto the free list ========================
8502 REM in use means reachable from the globals, from the evaluator's stack, or from its working values; marking uses the stack above sp
8505 LET ms=sp: LET k(ms+1)=g: LET k(ms+2)=ex: LET k(ms+3)=en: LET k(ms+4)=fu: LET k(ms+5)=hd: LET k(ms+6)=tl: LET k(ms+7)=rs: LET k(ms+8)=rv
8506 LET k(ms+9)=p1: LET k(ms+10)=p2: LET k(ms+11)=sm: LET k(ms+12)=vl: LET k(ms+13)=ob: LET k(ms+14)=x1: LET k(ms+15)=x2: LET k(ms+16)=op: LET ms=ms+16
8508 FOR h=1 TO sp: LET k(ms+h)=k(h): NEXT h: LET ms=ms+sp
8510 IF ms=sp THEN GO TO 8550
8515 LET p=k(ms): LET ms=ms-1: IF p<=0 OR p>cells THEN GO TO 8510
8520 IF b(p)=1 THEN GO TO 8510
8525 LET b(p)=1: IF t(p)=1 OR t(p)=5 THEN LET k(ms+1)=a(p): LET k(ms+2)=d(p): LET ms=ms+2
8530 GO TO 8510
8550 GO SUB 3600: FOR h=1 TO nsym: LET b(y(h))=1: NEXT h
8555 LET fr=0: LET free=0: FOR h=cells TO 1 STEP -1: IF b(h)=0 THEN LET t(h)=0: LET d(h)=fr: LET fr=h: LET free=free+1
8560 LET b(h)=0
8565 NEXT h: RETURN
9000 DATA "QUOTE","IF","COND","DEFUN","SETQ","LAMBDA","PROGN","AND","OR","LET","T","DEFPARAMETER"
9010 DATA "CAR",1,"CDR",2,"CONS",3,"ATOM",4,"EQ",5,"+",6,"-",7,"*",8,"/",9,"<",10,">",11,"=",12,"LIST",13,"NULL",14,"PRINT",15,"NUMBERP",16,"SYMBOLP",17,"VARP",18,"ROOM",19,"EQUAL",20,"ASSOC",21,"MEMBER",22,"LENGTH",23
9050 DATA "1 2 3 4 5 6 7 8 9 0 - =","Q W E R T Y U I O P","A S D F G H J K L ;","Z X C V B N M , . /"
9100 REM ======================== the prelude: the rest of Lisp, written in Lisp ========================
9101 DATA "(DEFUN NOT (X) (NULL X))"
9102 DATA "(DEFUN CADR (X) (CAR (CDR X)))"
9104 DATA "(DEFUN APPEND (A B) (IF (NULL A) B (CONS (CAR A) (APPEND (CDR A) B))))"
9105 DATA "(DEFUN MAPCAR (F L) (IF (NULL L) NIL (CONS (F (CAR L)) (MAPCAR F (CDR L)))))"
9108 DATA "(DEFUN REV (L A) (IF (NULL L) A (REV (CDR L) (CONS (CAR L) A))))"
9109 DATA "(DEFUN REVERSE (L) (REV L NIL))"
9110 DATA "(DEFUN FACT (N) (IF (< N 2) 1 (* N (FACT (- N 1)))))"
9120 REM ---- a toy RDF store: (subject predicate object) triples; A means rdf:type, as in Turtle ----
9121 DATA "(DEFPARAMETER *KB* '((PERCY A PELICAN) (PELICAN RDFS:SUBCLASSOF BIRD) (BIRD RDFS:SUBCLASSOF ANIMAL) (NED A MINER) (MINER RDFS:SUBCLASSOF PERSON) (VEGA A ASTRA) (ASTRA RDFS:SUBCLASSOF PERSON) (PIPKIN FOAF:KNOWS VEGA) (VEGA FOAF:KNOWS NED) (NED FOAF:KNOWS PERCY) (VEGA EX:LIVESON TITAN) (TITAN EX:ORBITS SATURN)))"
9122 REM matching one triple pattern against one triple: ?X stands for anything, but the same thing each time
9123 DATA "(DEFUN MATCH1 (P F B) (COND ((EQ B 'FAIL) 'FAIL) ((VARP P) (LET ((V (ASSOC P B))) (COND ((NULL V) (CONS (CONS P F) B)) ((EQ (CDR V) F) B) (T 'FAIL)))) ((EQ P F) B) (T 'FAIL)))"
9124 REM the predicate first: most triples fail there, and the rest is skipped
9125 DATA "(DEFUN MATCH (P F B) (MATCH1 (CAR P) (CAR F) (MATCH1 (CADR (CDR P)) (CADR (CDR F)) (MATCH1 (CADR P) (CADR F) B))))"
9126 REM a basic graph pattern: every way the first pattern fits, each extended by the rest
9127 DATA "(DEFUN QUERY1 (PAT FACTS B) (IF (NULL FACTS) NIL (LET ((R (MATCH PAT (CAR FACTS) B))) (IF (EQ R 'FAIL) (QUERY1 PAT (CDR FACTS) B) (CONS R (QUERY1 PAT (CDR FACTS) B))))))"
9128 DATA "(DEFUN WITH-P (P FACTS) (COND ((NULL FACTS) NIL) ((EQ (CADR (CAR FACTS)) P) (CONS (CAR FACTS) (WITH-P P (CDR FACTS)))) (T (WITH-P P (CDR FACTS)))))"
9129 REM join: pick out the triples with the pattern's predicate once, then try them against each solution so far
9130 DATA "(DEFUN JOIN2 (PAT FS BS) (IF (NULL BS) NIL (APPEND (QUERY1 PAT FS (CAR BS)) (JOIN2 PAT FS (CDR BS)))))"
9131 DATA "(DEFUN JOIN (PAT BS) (JOIN2 PAT (IF (VARP (CADR PAT)) *KB* (WITH-P (CADR PAT) *KB*)) BS))"
9132 DATA "(DEFUN SOLVE (PATS BS) (IF (NULL PATS) BS (SOLVE (CDR PATS) (JOIN (CAR PATS) BS))))"
9133 DATA "(DEFUN BGP (PATS) (SOLVE PATS (LIST (LIST (CONS T T)))))"
9134 DATA "(DEFUN FILL (TEMPLATE B) (MAPCAR (LAMBDA (X) (IF (VARP X) (CDR (ASSOC X B)) X)) TEMPLATE))"
9135 REM (QUERY '(SELECT (?X ?Y) WHERE pattern pattern ...)): shows the query, answers with a row per solution
9136 DATA "(DEFUN QUERY (Q) (PRINT Q) (MAPCAR (LAMBDA (B) (FILL (CADR Q) B)) (BGP (CDR (CDR (CDR Q))))))"
9137 REM inference: each rule is a CONSTRUCT, a template triple then its pattern; A climbs one subclass per round
9138 DATA "(DEFPARAMETER *RULES* '(((?X A ?D) (?X A ?C) (?C RDFS:SUBCLASSOF ?D)) ((?X FOAF:KNOWS ?Y) (?Y FOAF:KNOWS ?X))))"
9139 DATA "(DEFUN FIRE (RULE) (MAPCAR (LAMBDA (B) (FILL (CAR RULE) B)) (BGP (CDR RULE))))"
9140 DATA "(DEFUN FIRE-ALL (RS) (IF (NULL RS) NIL (APPEND (FIRE (CAR RS)) (FIRE-ALL (CDR RS)))))"
9141 DATA "(DEFUN ADD-NEW (FACTS KB) (COND ((NULL FACTS) KB) ((MEMBER (CAR FACTS) KB) (ADD-NEW (CDR FACTS) KB)) (T (ADD-NEW (CDR FACTS) (CONS (CAR FACTS) KB)))))"
9142 REM run every rule until nothing new appears; the answer is how many triples there are then
9143 DATA "(DEFUN INFER () (LET ((NEW (ADD-NEW (FIRE-ALL *RULES*) *KB*))) (IF (= (LENGTH NEW) (LENGTH *KB*)) (LENGTH *KB*) (PROGN (PRINT (LIST (- (LENGTH NEW) (LENGTH *KB*)) 'NEW)) (SETQ *KB* NEW) (INFER)))))"
9144 DATA "(DEFUN DEMO () (PRINT (QUERY '(SELECT (?X) WHERE (?X A PERSON)))) (PRINT (LIST (INFER) 'TRIPLES)) (PRINT (QUERY '(SELECT (?X) WHERE (?X A PERSON)))) (PRINT (QUERY '(SELECT (?X) WHERE (?X A ANIMAL)))) (QUERY '(SELECT (?X ?Y) WHERE (?X FOAF:KNOWS ?Y) (?Y EX:LIVESON TITAN))))"
9145 DATA "(DEFUN HELP () (PRINT '(TRY (+ 1 2) (FACT 10) (REVERSE '(A B C)))) (PRINT '(OR (DEFUN SQ (X) (* X X)) THEN (MAPCAR SQ '(1 2 3)))) (PRINT '(OR (QUERY '(SELECT (?X) WHERE (?X FOAF:KNOWS NED))))) (PRINT '(OR (DEMO) (INFER) *KB* (ROOM))) (PRINT '(UP AND DOWN BRING BACK EXAMPLES)) 'OK)"
9199 DATA "END"
9200 REM ---- the examples under the cursor keys: the last one here is the first that up brings back ----
9201 DATA "(ROOM)","*KB*","(REVERSE '(A B C))","(FACT 10)"
9202 DATA "(DEFUN SQ (X) (* X X))","(MAPCAR SQ '(1 2 3 4))","(MAPCAR (LAMBDA (X) (+ X 1)) '(1 2 3))"
9203 DATA "(LET ((A 2) (B 3)) (LIST A B (* A B)))"
9204 DATA "(DEMO)"
9205 DATA "(QUERY '(SELECT (?X) WHERE (?X A PERSON)))"
9206 DATA "(INFER)"
9207 DATA "(SETQ *KB* (CONS '(PIPKIN A ASTRA) *KB*))"
9208 DATA "(QUERY '(SELECT (?X ?C) WHERE (?X A ?C) (?C RDFS:SUBCLASSOF PERSON)))"
9209 DATA "(QUERY '(SELECT (?P ?O) WHERE (VEGA ?P ?O)))"
9210 DATA "(QUERY '(SELECT (?X ?Y) WHERE (?X FOAF:KNOWS ?Y) (?Y EX:LIVESON TITAN)))"
9211 DATA "(QUERY '(SELECT (?X) WHERE (?X FOAF:KNOWS NED)))"
9299 DATA "END"
` },
  { name: 'TVP', src: `5 REM touch:
10 REM TVP
20 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
30 LET nl=9: LET np=345: DIM cn(nl): DIM lx(np): DIM ly(np)
40 RESTORE 9000: LET k=0: FOR i=1 TO nl: READ cn(i): FOR j=1 TO cn(i): LET k=k+1: READ lx(k),ly(k): LET lx(k)=lx(k)/10: LET ly(k)=ly(k)/10: NEXT j: NEXT i
50 LET t=0
60 REPEAT
70 CLS: LET t=t+1: FX "lineStyle"
80 REM night-blue gradient, stacked bands
90 FOR b=0 TO 10: FX "beginFill", #0a0c18+b*#040610, 100: FX "moveTo", 0, b*16: FX "lineTo", 256, b*16: FX "lineTo", 256, b*16+16: FX "lineTo", 0, b*16+16: FX "endFill": NEXT b
100 REM pulsing magenta glow behind the logo
110 FOR g=5 TO 1 STEP -1: FX "beginFill", #c020a0, 6+3*SIN (t/7): LET rr=g*22+6*SIN (t/5): GO SUB 1000: NEXT g
120 REM the logo flies in, then breathes
130 LET s=1+9*EXP (-t/12): LET al=100-100*EXP (-t/8): IF t>40 THEN LET s=1+0.02*SIN (t/9)
140 LET ox=128: LET oy=80: LET rf=0: FX "beginFill", #ffffff, al: GO SUB 2000
150 REM the reflection on the glossy floor
160 LET rf=1: FX "beginFill", #ffffff, 18: GO SUB 2000
170 REM a shine sweeping across
180 LET sx=((t*4)-INT ((t*4)/400)*400)-80: FX "beginFill", #ffffff, 22: FX "moveTo", sx, 40: FX "lineTo", sx+28, 40: FX "lineTo", sx+58, 124: FX "lineTo", sx+30, 124: FX "endFill"
190 REM the little loading dots
200 FOR d=0 TO 7: LET a=t/6+d*PI/4: FX "beginFill", #ffffff, 25+70*(d=INT (t/3)-INT (INT (t/3)/8)*8): LET cx=128+18*COS a: LET cy=150+6*SIN a: FX "moveTo", cx-2, cy-2: FX "lineTo", cx+2, cy-2: FX "lineTo", cx+2, cy+2: FX "lineTo", cx-2, cy+2: FX "endFill": NEXT d
210 REM TV scanlines, because 2007
220 FX "lineStyle", 1, #000000, 12: FOR y=1 TO 175 STEP 2: FX "moveTo", 0, y: FX "lineTo", 256, y: NEXT y
225 IF t>40 THEN PRINT AT 21,8; INK 1; "ANY KEY: LOADER": IF INKEY$<>"" OR MOUSEB<>0 THEN LOADER
230 PAUSE 1
240 UNTIL 0
1000 REM glow ring of radius rr at (128,80), 24 segments
1010 FX "moveTo", 128+rr, 80: FOR a=1 TO 24: FX "lineTo", 128+rr*COS (a*PI/12), 80+rr*0.62*SIN (a*PI/12): NEXT a: FX "endFill": RETURN
2000 REM draw the traced logo through midpoint quadratics; rf=1 mirrors it below the baseline and squashes it
2010 LET k=0: LET ka=1-1.5*rf: LET kb=rf*1.5*(oy+34*s)
2020 FOR i=1 TO nl
2030 LET n=cn(i): LET ax=lx(k+n): LET ay=ly(k+n): LET bx=lx(k+1): LET by=ly(k+1): FX "moveTo", ox+((ax+bx)/2-128)*s, ka*(oy+((ay+by)/2-80)*s)+kb
2040 FOR j=1 TO n: LET ax=lx(k+j): LET ay=ly(k+j): LET bx=lx(k+1+(j-INT (j/n)*n)): LET by=ly(k+1+(j-INT (j/n)*n)): FX "curveTo", ox+(ax-128)*s, ka*(oy+(ay-80)*s)+kb, ox+((ax+bx)/2-128)*s, ka*(oy+((ay+by)/2-80)*s)+kb: NEXT j
2050 LET k=k+n
2060 NEXT i
2070 FX "endFill": RETURN
9000 DATA 146,1797,482,1787,482,1787,918,1759,918,1759,909,1740,909,1740,900,1598,833,1607,805,1635,805,1635,814,1749,862,1749,729,1721,710,1683,710,1683,700,1550,710,1550,719,1512,729,1493,757,1474
9001 DATA 757,1465,776,1446,776,1427,748,1408,748,1398,729,1351,719,1351,710,1228,710,1228,719,1199,719,1171,748,1152,748,1095,814,1067,767,1048,767,1038,748,1019,748,1000,729,953,729,953,719,839,738
9002 DATA 792,786,773,786,773,672,763,672,716,719,697,719,688,738,659,748,659,966,621,1023,602,1023,583,1042,507,1042,451,1004,451,985,432,966,432,928,318,928,327,1013,384,1099,403,1099,441,1136,470
9003 DATA 1136,498,1155,593,1155,593,1146,650,1136,688,1099,716,1089,716,1070,744,1051,744,1032,763,1032,782,1051,782,1070,801,1070,820,1099,839,1099,858,1118,896,1118,896,1127,1000,1118,1000,1108
9004 DATA 1038,1099,1048,1080,1067,1080,1105,1042,1162,1108,1180,1108,1218,1136,1266,1136,1266,1146,1361,1136,1361,1127,1417,1108,1455,1070,1484,1108,1503,1108,1512,1127,1531,1127,1550,1146,1692,1155
9005 DATA 1692,1146,1721,1146,1721,1136,1778,1118,1825,1061,1844,1070,1853,1099,1872,1099,1910,1136,1939,1136,1967,1155,2062,1155,2062,1146,2119,1136,2128,1118,2176,1099,2185,1070,2214,1051,2233,985
9006 DATA 2242,985,2242,928,2128,928,2128,966,2119,966,2109,1004,2053,1042,1977,1042,1977,1032,1939,1023,1901,966,1901,852,1977,852,1986,833,2005,833,2015,748,1986,719,1901,719,1901,558,1882,539,1863
9007 DATA 539,1853,520,1835,520,121,1749,407,1939,539,1939,682,2005,691,2053,748,2043,843,1977,890,1939,890,1939,966,1967,994,1986,994,1986,1004,2062,994,2090,966,2090,890,2280,890,2280,985,2271,985
9008 DATA 2252,1061,2176,1146,2157,1146,2119,1174,2053,1184,2053,1193,1977,1193,1977,1184,1910,1174,1910,1165,1853,1146,1835,1118,1816,1118,1787,1155,1768,1155,1730,1184,1692,1184,1692,1193,1541,1184
9009 DATA 1541,1174,1484,1155,1465,1127,1436,1127,1427,1146,1361,1165,1361,1174,1275,1184,1275,1174,1190,1165,1190,1155,1152,1146,1143,1127,1124,1127,1105,1099,1086,1099,1067,1127,1048,1127,1029,1146
9010 DATA 962,1155,962,1165,906,1165,906,1155,830,1146,754,1089,707,1146,688,1146,650,1174,583,1184,583,1193,507,1193,507,1184,470,1184,470,1174,441,1174,441,1165,384,1146,299,1042,299,1013,280,985
9011 DATA 280,890,470,890,470,966,498,994,517,994,517,1004,593,994,621,966,621,738,631,738,631,719,650,719,659,700,707,682,725,653,773,634,792,606,811,606,811,710,944,682,944,691,1000,691,1019,710
9012 DATA 1048,710,1086,748,1124,738,1171,691,1199,691,1228,672,1351,672,1351,682,1380,682,1380,691,1436,710,1446,729,1465,729,1503,691,1531,691,1531,682,1588,672,1588,663,1683,663,1683,672,1749,682
9013 DATA 18,669,407,763,416,801,454,811,549,801,549,792,587,763,596,754,615,725,615,725,625,650,615,640,596,621,596,621,577,593,549,593,482,602,482,612,445,15,896,824,972,824,1029,881,1029,909,1038
9014 DATA 909,1029,966,972,1023,934,1023,934,1032,887,1023,830,966,830,890,839,890,849,852,896,833,10,1256,814,1351,824,1389,862,1398,966,1332,1032,1247,1032,1180,966,1180,881,1228,824,1256,824,9,1266
9015 DATA 852,1237,862,1218,890,1218,956,1256,994,1323,994,1361,956,1361,890,1323,852,9,906,862,868,890,868,956,925,994,981,975,981,956,1000,937,991,890,962,862,9,1512,937,1654,1004,1673,1023,1673
9016 DATA 1042,1645,1051,1645,1042,1607,1032,1598,1013,1503,975,8,678,445,631,482,631,539,659,577,725,587,773,539,773,482,735,445
` },
  { id: 'emo-asteroids', name: 'Emo Asteroids (emoji bitmaps)', src: `5 REM touch: a=LEFT w=GO d=RIGHT l=LOADER
10 REM EMO ASTEROIDS - a cosy drift through a wraparound sky. Nothing here can hurt you.
20 EMOJI "🚀","ship",48: EMOJI "🪨","r1",64: EMOJI "🌑","r2",64: EMOJI "🍩","r3",64: EMOJI "🧀","r4",64: EMOJI "🪐","r5",64
30 EMOJI "✨","spark",32: EMOJI "⭐","star",20: EMOJI "💖","heart",32: EMOJI "🌟","pop",40
40 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
50 LET n=7: DIM ax(n): DIM ay(n): DIM au(n): DIM av(n): DIM ar(n): DIM aw(n): DIM ab(n): DIM ak(n)
60 LET ns=28: DIM sx(ns): DIM sy(ns): DIM sb(ns): FOR i=1 TO ns: LET sx(i)=RND*256: LET sy(i)=8+RND*160: LET sb(i)=RND*6: NEXT i
70 FOR i=1 TO n: GO SUB 900: NEXT i
80 LET nb=5: DIM bx(nb): DIM by(nb): DIM bu(nb): DIM bv(nb): DIM bl(nb)
90 LET nq=10: DIM qx(nq): DIM qy(nq): DIM qu(nq): DIM qv(nq): DIM ql(nq): DIM q$(nq)
100 LET px=128: LET py=88: LET pa=-90: LET pu=0: LET pv=0: LET found=0: LET t=0: LET fire=0
110 REPEAT
120 SPRITE CLEAR: LET t=t+1
130 REM stars twinkle
140 FOR i=1 TO ns: SPRITE "star", sx(i), sy(i), 50+25*SIN (t/9+sb(i)), 50+25*SIN (t/9+sb(i)), 0, 35+30*SIN (t/13+sb(i)*2): NEXT i
150 REM steering: a/d or cursors turn, w/up thrusts, click or touch steers the ship towards the pointer
160 LET k$=INKEY$
165 IF k$="l" OR k$="L" THEN LOADER
170 IF k$="a" OR k$=CHR$ 8 THEN LET pa=pa-6
180 IF k$="d" OR k$=CHR$ 9 THEN LET pa=pa+6
190 IF k$="w" OR k$=CHR$ 11 THEN LET pu=pu+0.18*COS (pa*PI/180): LET pv=pv+0.18*SIN (pa*PI/180)
200 IF MOUSEB=1 THEN LET dx=MOUSEX-px: LET dy=(175-MOUSEY)-py: IF ABS dx+ABS dy>6 THEN LET pa=ATN (dy/(dx+0.001))*180/PI+180*(dx<0): LET pu=pu+0.14*COS (pa*PI/180): LET pv=pv+0.14*SIN (pa*PI/180)
210 LET pu=pu*0.985: LET pv=pv*0.985: LET px=px+pu: LET py=py+pv
220 IF px<0 THEN LET px=px+256
230 IF px>=256 THEN LET px=px-256
240 IF py<0 THEN LET py=py+176
250 IF py>=176 THEN LET py=py-176
260 REM the ship sends out sparkles by itself
270 LET fire=fire+1: IF fire>=22 THEN LET fire=0: FOR i=1 TO nb: IF bl(i)<=0 THEN LET bx(i)=px: LET by(i)=py: LET bu(i)=pu+3*COS (pa*PI/180): LET bv(i)=pv+3*SIN (pa*PI/180): LET bl(i)=55: LET i=nb
275 IF fire=0 THEN NEXT i: TONE 12+2*INT (RND*4)
280 FOR i=1 TO nb: IF bl(i)>0 THEN LET bl(i)=bl(i)-1: LET bx(i)=bx(i)+bu(i): LET by(i)=by(i)+bv(i): LET bx(i)=bx(i)-256*INT (bx(i)/256): LET by(i)=by(i)-176*INT (by(i)/176): SPRITE "spark", bx(i), by(i), 40+20*SIN (t/2+i), 40+20*SIN (t/2+i), t*9, 100*bl(i)/55
290 NEXT i
300 REM asteroids drift, spin and wrap
310 FOR i=1 TO n
320 LET ax(i)=ax(i)+au(i): LET ay(i)=ay(i)+av(i): LET ar(i)=ar(i)+aw(i)
330 LET ax(i)=ax(i)-256*INT (ax(i)/256): LET ay(i)=ay(i)-176*INT (ay(i)/176)
340 LET rr=ab(i)*0.3
350 REM a sparkle meeting an asteroid turns it into a smaller, happier one
360 FOR j=1 TO nb: IF bl(j)>0 THEN IF ABS (bx(j)-ax(i))<rr AND ABS (by(j)-ay(i))<rr THEN LET bl(j)=0: GO SUB 700
370 NEXT j
380 REM bumping into one just nudges you both, softly
390 IF ABS (px-ax(i))<rr+6 AND ABS (py-ay(i))<rr+6 THEN LET pu=pu+(px-ax(i))*0.02: LET pv=pv+(py-ay(i))*0.02: LET au(i)=au(i)-(px-ax(i))*0.004: LET av(i)=av(i)-(py-ay(i))*0.004: IF t-lt>15 THEN LET lt=t: TONE -7
400 SPRITE "r"+STR$ ak(i), ax(i), ay(i), ab(i), ab(i), ar(i), 100
410 NEXT i
420 REM little sparks and hearts fade away
430 FOR i=1 TO nq: IF ql(i)>0 THEN LET ql(i)=ql(i)-1: LET qx(i)=qx(i)+qu(i): LET qy(i)=qy(i)+qv(i): LET qv(i)=qv(i)-0.03: SPRITE q$(i), qx(i), qy(i), 30+ql(i), 30+ql(i), t*5*(i-INT (i/2)*2*2+1), 100*ql(i)/40
440 NEXT i
450 SPRITE "ship", px, py, 80, 80, pa+45, 100
460 PRINT AT 0,0; INK 6; "EMO ASTEROIDS"; TAB 20; INK 5; "found "; found
470 PRINT AT 21,0; INK 1; BRIGHT 1; "a d turn  w go  l loader  touch"
480 PAUSE 1
490 UNTIL 0
700 REM --- an asteroid is greeted: it shrinks, sheds sparks, and eventually becomes a heart and is reborn ---
710 LET found=found+1: TONE 7+INT (RND*3)*2+(found-INT (found/5)*5)
720 FOR k=1 TO 3: GO SUB 800: NEXT k
730 IF ab(i)>45 THEN LET ab(i)=ab(i)*0.72: LET au(i)=au(i)*1.3+(RND-0.5)*0.4: LET av(i)=av(i)*1.3+(RND-0.5)*0.4: LET aw(i)=aw(i)*1.5: RETURN
740 LET q$(1+(t-INT (t/nq)*nq))="heart": LET qx(1+(t-INT (t/nq)*nq))=ax(i): LET qy(1+(t-INT (t/nq)*nq))=ay(i): LET qu(1+(t-INT (t/nq)*nq))=0: LET qv(1+(t-INT (t/nq)*nq))=-0.6: LET ql(1+(t-INT (t/nq)*nq))=40
750 TONE 19: GO SUB 900: RETURN
800 REM a spark particle in a free slot
810 FOR m=1 TO nq: IF ql(m)<=0 THEN LET q$(m)="pop": LET qx(m)=ax(i): LET qy(m)=ay(i): LET qu(m)=(RND-0.5)*2: LET qv(m)=(RND-0.5)*2: LET ql(m)=24+RND*14: LET m=nq
820 NEXT m: RETURN
900 REM --- a fresh asteroid drifting in from an edge ---
910 LET ak(i)=1+INT (RND*5): LET ab(i)=55+RND*45: LET ar(i)=RND*360: LET aw(i)=(RND-0.5)*3
920 LET ax(i)=RND*256: LET ay(i)=RND*176: IF ABS (ax(i)-px)<50 AND ABS (ay(i)-py)<50 THEN LET ax(i)=ax(i)+128: LET ax(i)=ax(i)-256*INT (ax(i)/256)
930 LET au(i)=(RND-0.5)*1.2: LET av(i)=(RND-0.5)*1.2: RETURN
` },
  { id: 'miner-ned', name: 'Miner Ned (Manic Miner tribute)', src: `5 REM touch: left right space=JUMP m=MUSIC l=LOADER
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
` },
  { id: 'four-hallows', name: 'The Four Hallows (isometric quest)', src: `5 REM touch: up down left right space=JUMP t=TAKE l=LOADER
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
` },
  { id: 'pipkins-quest', name: "Pipkin's Quest (text adventure)", src: `5 REM touch: >n=N >s=S >e=E >w=W >u=UP >d=DOWN >look=LOOK >i=INV enter
10 REM PIPKIN'S QUEST - a text adventure with pictures, a homage to the 1982 Melbourne House adventure. All names and text here are original.
11 REM Who stands in for whom: pipkin = the burrow-dwelling hero; wendel = the wizard; durrock = the dwarf leader; aelric = lord of the hidden valley;
12 REM sliver = the creature of the underground lake; harl = the bowman of the lake town; ashwyrm = the dragon; ursk = the skin-changer; the butler = the woodkings butler;
13 REM the ogres = the trolls; the grey wolf = the warg; the woodfolk = the wood elves; hollow hill = the hero's home; elmhaven = the hidden valley;
14 REM the grey peaks = the misty mountains; the murkwold = the dark forest; reedmere = the long lake and its town; kelder = the ruined town; the ashen crag = the lonely mountain.
15 REM Commands: directions, look, take, drop, inventory, open, close, unlock, wait, kill, examine, wear, remove, break, throw, put, climb, cross, give, eat, drink, pull, answer, shoot, sleep, score, help, quit.
16 REM Talking: say to durrock "open window", say to harl "follow me", say to harl "shoot dragon", say to aelric "read chart", say to sliver "<answer>".
17 REM Screen: rows 0-9 hold a line-drawn picture of the place (FX calls at 10000+), text runs from row 10 down.
18 REM Walkthrough: wait, wait, e, e, sw, wait x3 (dawn), e, take key, n, unlock door, open door, n, take blade, take rope, s, s, se, give chart to aelric, wait (he reads it), e, e, n, wait (goblin takes you),
19 REM wait x3 (durrock arrives), say to durrock "open window", w, sw, d, n, se, e, take band (or answer sliver's riddle to get it back), n, d, u, se, e, e, kill wolf, sw, s, open curtain, take bread, ne, s, e, e, s,
20 REM throw rope, e, e, break web, ne, break web, ne, break web, n, (wait for the pale door or be taken by the woodfolk), n, e, climb barrel, wait x3, n, say to harl "follow me", s, e, e, ne, wait for the hole,
21 REM e, d, d, say to harl "shoot dragon" (or wear band first and sneak), take hoard, u, u, w (hole), sw, w, w, w, w, w, w, s, sw, sw, w, w, n, w, w, w, n, w, w, w, w, w, sw, w, open chest, put hoard in chest.
22 REM Eat the lunch and the bread when hungry; the band hides you for twelve turns and can be worn again.
23 BORDER 7: PAPER 7: INK 0: CLS
24 WRAP 1
25 EMOJI "🐉", "dragon", 64
26 EMOJI "💍", "ring", 16
27 EMOJI "🗝", "key", 16
30 DIM n$(53): DIM e$(53): DIM o$(18): DIM on$(18): DIM ol(18): DIM of(18): DIM dn$(10): DIM dm$(15): DIM dst(15): DIM w$(4): DIM pc(53)
40 RESTORE 20001: FOR i=1 TO 53: READ n$(i),e$(i): NEXT i
50 FOR i=1 TO 18: READ o$(i),on$(i),ol(i),of(i): NEXT i
60 FOR i=1 TO 10: READ dn$(i): NEXT i
70 FOR i=1 TO 15: READ dm$(i): NEXT i
75 FOR i=1 TO 53: READ pc(i): NEXT i
80 FOR i=1 TO 15: LET dst(i)=1: NEXT i: LET dst(2)=0: LET dst(3)=0: LET dst(4)=0: FOR i=6 TO 11: LET dst(i)=0: NEXT i: LET dst(14)=1
90 LET r=1: LET tn=0: LET ct=0: LET day=0: LET dc=0: LET gl=1: LET th=1: LET thr=1: LET dl=0: LET co=0: LET wr=0: LET rtm=0: LET wg=1: LET wlr=23: LET bt=0: LET em=0: LET og=1
91 LET kt=0: LET st=0: LET mr=0: LET gd=0: LET gw=0: LET rt=0: LET ec=0: LET be=0: LET tt=0: LET dk=0: LET won=0: LET hg=0: LET hp=3: LET gb=3: LET gbr=0
92 LET sv=1: LET svr=0: LET rd=0: LET rq=1+INT (RND*2): LET rw=0: LET dg=0: LET dgr=0: LET df=0: LET dw=0: LET hf=0: LET hr=45: LET ib=0: LET bf=0: LET bw=0: LET mt=3: LET ht=3: LET ar=0: LET pg=0: LET mq=0
93 LET wl$="02030406070821222526": LET wo$="2322262721"
100 LET vw$="n      1north  1s      2south  2e      3east   3w      4west   4ne     5northea5nw     6northwe6se     7southea7sw     8southwe8u      9up     9d      :down   :go     ;run    ;walk   ;look   <l      <take   =get    =t      =grab   ="
101 LET vw$=vw$+"drop   >invento?i      ?inv    ?open   @close  Ashut   Aunlock Bsay    Ctalk   Cask    Ctell   Cwait   Dz      Dkill   Eattack Efight  Estrike Ehit    Estab   EexamineFx      Fread   Fsearch Fhelp   Gquit   Hwear   Iremove Jbreak  K"
102 LET vw$=vw$+"cut    Kslash  Kthrow  Lput    Minsert Mclimb  Njump   Nenter  Nride   Neat    Odrink  Pscore  Qcross  Rswim   Rgive   Soffer  Spull   Thaul   Tanswer Ushoot  Vfire   Vsleep  Wrest   Wthe    /a      /an     /to     /with   /at     /"
103 LET vw$=vw$+"in     /into   /of     /me     /across /through/onto   /from   /out    /and    /on     /please /my     /loader H"
130 GO SUB 2500
135 PRINT "PIPKIN'S QUEST. a small person, a long road, and a dragon at the end of it. type HELP for a list of words."
200 INPUT "> "; a$
205 CLS : GO SUB 9900: PRINT AT 10,0;"> ";a$
210 GO SUB 1400: GO SUB 1500
220 IF nw=0 THEN PRINT " pardon ?": GO TO 200
230 LET t$=w$(1): GO SUB 1600: IF v=0 THEN GO SUB 1700
240 IF v=0 THEN PRINT " i do not understand "" ";w$(1);" """: GO TO 200
250 IF v=11 AND w$(2)<>"" THEN LET t$=w$(2): GO SUB 1600: IF v<=0 OR v>10 THEN LET v=11
260 IF v=12 AND w$(2)<>"" THEN LET v=22
270 IF v=13 AND w$(2)="off" THEN LET v=26: LET w$(2)=w$(3)
275 IF v=30 AND w$(2)="out" THEN LET w$(2)=""
280 LET ob=0: FOR i=1 TO 18: IF o$(i)=w$(3) THEN LET ob=i
290 NEXT i: FOR i=1 TO 18: IF o$(i)=w$(2) THEN LET ob=i
300 NEXT i
310 IF v<=10 THEN LET d=v: GO SUB 2000: GO TO 900
320 GO TO 5000+v*50
900 GO SUB 3000: GO TO 200
1400 LET a$=a$+" ": FOR p=1 TO LEN a$: LET c=CODE (a$(p)): IF c>64 AND c<91 THEN LET a$=a$(1 TO p-1)+CHR$ (c+32)+a$(p+1 TO )
1410 IF c=34 OR c=44 OR c=46 OR c=39 OR c=63 OR c=33 THEN LET a$=a$(1 TO p-1)+" "+a$(p+1 TO )
1420 NEXT p: RETURN
1500 LET nw=0: LET s=0: FOR i=1 TO 4: LET w$(i)="": NEXT i
1510 FOR p=1 TO LEN a$: IF a$(p)<>" " AND s=0 THEN LET s=p
1520 IF a$(p)=" " AND s>0 THEN LET t$=a$(s TO p-1): LET s=0: GO SUB 1550
1530 NEXT p: RETURN
1550 LET u$=t$: GO SUB 1600: LET t$=u$: IF v<0 THEN RETURN
1560 IF t$="map" THEN LET t$="chart"
1562 IF t$="sword" OR t$="dagger" THEN LET t$="blade"
1564 IF t$="ring" THEN LET t$="band"
1566 IF t$="treasure" OR t$="gold" OR t$="sack" THEN LET t$="hoard"
1568 IF t$="trapdoor" OR t$="trap" THEN LET t$="hatch"
1570 IF t$="food" OR t$="loaf" THEN LET t$="bread"
1572 IF t$="jug" THEN LET t$="wine"
1574 IF t$="cask" THEN LET t$="barrel"
1576 IF t$="dwarf" THEN LET t$="durrock"
1578 IF t$="wizard" THEN LET t$="wendel"
1580 IF t$="lord" OR t$="elf" THEN LET t$="aelric"
1582 IF t$="creature" OR t$="thing" THEN LET t$="sliver"
1584 IF t$="bowman" OR t$="man" THEN LET t$="harl"
1586 IF t$="dragon" OR t$="beast" OR t$="wyrm" THEN LET t$="ashwyrm"
1588 IF t$="bear" OR t$="skinchanger" THEN LET t$="ursk"
1590 IF t$="troll" OR t$="trolls" OR t$="ogres" THEN LET t$="ogre"
1592 IF t$="warg" OR t$="wolves" THEN LET t$="wolf"
1594 IF t$="woodfolk" OR t$="guard" THEN LET t$="archer"
1596 IF nw<4 THEN LET nw=nw+1: LET w$(nw)=t$
1598 RETURN
1600 LET v=0: LET t$=t$+"       ": LET t$=t$(1 TO 7)
1610 FOR k=1 TO LEN vw$ STEP 8: IF vw$(k TO k+6)=t$ THEN LET v=CODE (vw$(k+7))-48: LET k=LEN vw$
1620 NEXT k: RETURN
1700 LET c$=w$(1): IF c$<>"durrock" AND c$<>"wendel" AND c$<>"aelric" AND c$<>"sliver" AND c$<>"harl" AND c$<>"ursk" AND c$<>"butler" THEN RETURN
1710 LET w$(4)=w$(3): LET w$(3)=w$(2): LET w$(2)=w$(1): LET w$(1)="say": LET v=19: RETURN
1950 LET dr=0: LET d=0: FOR j=1 TO LEN e$(r) STEP 4: LET q=CODE (e$(r)(j+1))-48: IF q>9 THEN LET q=q-7
1955 IF (q>=1 AND q<=5 OR q>=12) AND dr=0 THEN LET dr=q: LET d=VAL (e$(r)(j)): IF d=0 THEN LET d=10
1960 NEXT j: RETURN
2000 IF ib=1 THEN PRINT " you are inside a barrel. the world is small and dark and smells of wine.": RETURN
2005 LET dr=0: LET nx=0: FOR j=1 TO LEN e$(r) STEP 4: LET q=VAL (e$(r)(j)): IF q=0 THEN LET q=10
2010 IF q=d THEN LET nx=VAL (e$(r)(j+2 TO j+3)): LET dr=CODE (e$(r)(j+1))-48: IF dr>9 THEN LET dr=dr-7
2020 NEXT j
2030 IF nx=0 THEN PRINT " there is no way ";dn$(d);".": RETURN
2040 IF dr>0 AND dst(dr)<2 THEN GO SUB 2200: RETURN
2045 IF dr=3 AND thr<>r THEN PRINT " the window is far above your reach, and durrock is not here to lift you.": RETURN
2050 IF dr=10 THEN LET ol(13)=nx
2055 LET mq=dr: LET r=nx: LET ct=0: LET gbr=0: GO SUB 2500
2060 IF mq=3 THEN PRINT "durrock lifted you up and squeezed you through the window.": LET gw=1
2062 IF mq=10 THEN PRINT "you poled across the black water in the little boat."
2065 IF mq=12 THEN PRINT "you dropped through the hatch into rushing water."
2068 IF mq=14 THEN PRINT "you squeezed through the hole in the stone."
2070 RETURN
2200 IF dr=3 THEN PRINT " the window is far above your reach.": RETURN
2210 IF dr=11 THEN PRINT " there is no way ";dn$(d);".": RETURN
2215 IF dr=4 THEN PRINT " the iron goblin door is locked and bolted from the far side.": RETURN
2220 IF dr<=5 AND dst(dr)=0 THEN PRINT " the ";dm$(dr);" is locked.": RETURN
2230 IF dr<=5 THEN PRINT " the ";dm$(dr);" is shut.": RETURN
2240 IF dr<=9 THEN PRINT " a thick grey web bars the way.": RETURN
2245 IF dr=12 THEN PRINT " the hatch is shut.": RETURN
2250 IF dr=13 THEN PRINT " the pale door is shut fast, and shows no handle.": RETURN
2255 IF dr=14 THEN PRINT " the grey wall is smooth and solid.": RETURN
2260 IF dr=15 THEN PRINT " the great gate is choked with fallen rock and scalding vapour. nothing passes.": RETURN
2270 PRINT " the black water is too wide and too cold to cross.": RETURN
2500 CLS : GO SUB 9900: PRINT AT 10,0;"you are ";n$(r);".": LET x$=""
2505 LET dk=(r=12 OR (r>=14 AND r<=20)) AND ol(4)<>99: IF dk THEN PRINT "it is pitch dark. you feel your way along the wall."
2510 FOR j=1 TO LEN e$(r) STEP 4: LET q=VAL (e$(r)(j)): IF q=0 THEN LET q=10
2520 LET dr=CODE (e$(r)(j+1))-48: IF dr>9 THEN LET dr=dr-7
2530 IF dr=0 OR (dr>5 AND dr<=11 AND dst(dr)=2) THEN LET x$=x$+dn$(q)+" "
2540 IF dr>0 AND dr<=5 THEN PRINT "to the ";dn$(q);" is the ";dm$(dr)
2550 IF dr>5 AND dr<=9 AND dst(dr)<2 THEN PRINT "to the ";dn$(q);" hangs a thick grey web"
2555 IF dr=10 AND dst(10)<2 THEN PRINT "to the ";dn$(q);" flows the black river"
2560 IF dr=10 AND dst(10)=2 THEN PRINT "to the ";dn$(q);" flows the black river. a small boat is moored here"
2562 IF dr=12 AND dst(12)=2 THEN PRINT "the hatch stands open. water roars below.": LET x$=x$+"down "
2564 IF dr=13 AND dst(13)=2 THEN PRINT "to the ";dn$(q);" the pale door stands open"
2565 IF dr=13 AND dst(13)<2 THEN PRINT "to the ";dn$(q);" a door of pale wood is shut fast"
2566 IF dr=14 AND dst(14)=2 THEN PRINT "a dark hole gapes in the wall to the ";dn$(q)
2568 IF dr=15 THEN PRINT "to the ";dn$(q);" the great gate is choked with rubble"
2570 NEXT j: IF x$<>"" THEN PRINT "ways out: ";x$
2575 IF dk THEN GO SUB 2700: RETURN
2580 PRINT "you can see:": LET c=0: FOR i=1 TO 18: IF ol(i)=r THEN PRINT on$(i);".": LET c=1
2590 NEXT i: GO SUB 2700: IF c=0 THEN PRINT "      nothing of note"
2600 RETURN
2700 IF gl=r AND ol(1)=0 THEN PRINT "wendel the wizard, holding a faded chart.": LET c=1
2705 IF gl=r AND ol(1)<>0 THEN PRINT "wendel the wizard.": LET c=1
2710 IF th=1 AND thr=r THEN PRINT "durrock the dwarf.": LET c=1
2715 IF r=6 THEN PRINT "aelric, lord of elmhaven.": LET c=1
2720 IF svr=r AND NOT dk THEN PRINT "sliver, a pale creeping thing.": LET c=1
2725 IF hr=r THEN PRINT "harl the bowman.": LET c=1
2730 IF r=53 AND dg=0 THEN PRINT "ashwyrm the dragon, asleep on a hill of gold.": LET c=1
2735 IF dgr=r AND dg=1 THEN PRINT "ashwyrm the dragon, awake and hunting.": LET c=1
2740 IF r=53 AND dg=2 THEN PRINT "the vast carcass of ashwyrm.": LET c=1
2745 IF r=3 AND og=1 THEN PRINT "a fat ogre, clutching a big iron key."'"a lean ogre.": LET c=1
2750 IF wlr=r AND wg=1 THEN PRINT "a grey wolf.": LET c=1
2755 IF gbr=r AND NOT dk THEN PRINT "a scrawny goblin.": LET c=1
2760 IF ar=1 THEN PRINT "an archer of the woodfolk.": LET c=1
2765 IF r=21 THEN PRINT "ursk the skin-changer, a huge man with a black beard.": LET c=1
2770 IF r=41 THEN PRINT "the butler, asleep beside an empty jug.": LET c=1
2775 IF r=3 AND og=0 THEN PRINT "two ogres, turned to stone.": LET c=1
2790 RETURN
3000 LET tn=tn+1: LET ct=ct+1: LET hg=hg+1: LET dc=dc+1
3005 IF wr=1 THEN LET rtm=rtm-1: IF rtm=1 THEN PRINT "the copper band grows warm on your finger. its magic is nearly spent."
3006 IF wr=1 AND rtm<=0 THEN LET wr=0: PRINT "the band flickers, and its magic fades. you are plain to see again."
3010 IF tn=8 THEN PRINT "the sun comes up.": LET day=1: LET dc=0: LET ol(3)=3: LET og=0: LET n$(3)="in a clearing beside two ogres turned to stone": IF r=3 THEN PRINT "the ogres freeze mid-argument, and are stone."
3015 IF tn>8 AND dc>=30 THEN LET dc=0: LET day=1-day: IF day=0 THEN PRINT "the sun goes down. night falls."
3016 IF tn>8 AND dc=0 AND day=1 THEN PRINT "the sun comes up."
3020 IF hg=60 THEN PRINT "your stomach rumbles. you are getting hungry."
3022 IF hg>=90 AND hg-INT (hg/10)*10=0 THEN PRINT "you are faint with hunger. you must eat soon."
3024 IF hg>=130 THEN PRINT "you collapse from hunger, and do not get up.": GO TO 4500
3100 IF tn=1 AND gl=r THEN PRINT "wendel hands you the faded chart.": LET ol(1)=99
3102 IF tn=2 AND gl=r THEN PRINT "wendel pushes open the round oak door.": LET dst(1)=2
3104 IF tn=3 THEN LET gl=0: IF r=1 OR r=2 THEN PRINT "wendel strides off to the east, humming."
3106 IF tn>3 AND RND<0.2 THEN LET pg=gl: LET q=INT (RND*10)+1: LET gl=VAL (wl$(q*2-1 TO q*2)): IF gl=r AND pg<>r THEN PRINT "wendel appears from nowhere, leaning on his staff."
3107 IF tn>3 AND pg=r AND gl<>r AND pg<>0 THEN PRINT "wendel wanders off on business of his own.": LET pg=0
3108 IF tn>3 AND gl=r THEN LET q=INT (RND*4): IF q=0 THEN PRINT "wendel says "" you are doing better than i feared ""."
3109 IF tn>3 AND gl=r AND q=1 THEN PRINT "wendel peers at you over his beard and says nothing."
3110 IF tn>3 AND gl=r AND q=2 AND ol(1)=99 THEN PRINT "wendel says "" keep that chart dry. aelric can read what you cannot ""."
3200 IF th=0 THEN GO TO 3300
3205 IF thr<>r AND dl>0 THEN LET dl=dl-1: GO TO 3300
3210 IF thr<>r AND r<>42 THEN LET thr=r: PRINT "durrock follows you in.": GO TO 3300
3215 LET q=INT (RND*6): IF q=0 THEN PRINT "durrock stands about, scowling."
3216 IF q=1 THEN PRINT "durrock says "" we are wasting daylight ""."
3217 IF q=2 THEN PRINT "durrock sits on a rock and sings, low and slow, about lost gold."
3218 IF q=3 AND wr=1 THEN PRINT "durrock says "" where has the thief got to? ""."
3300 IF r=3 AND og=1 AND ct=1 THEN PRINT "the fat ogre says "" look what the night brought us. is it good eating? ""."'"the lean ogre says "" not much meat on it, but it will do "".": GO TO 3400
3302 IF r=3 AND og=1 AND wr=0 THEN PRINT "the fat ogre grabs you and swallows you whole.": GO TO 4500
3304 IF r=3 AND og=1 THEN PRINT "the ogres sniff the air and argue about what they can smell."
3350 IF r=9 AND gd=0 AND ct=1 THEN PRINT "a crack in the floor grinds open."'"a scrawny goblin creeps in.": GO TO 3400
3352 IF r=9 AND gd=0 AND wr=0 THEN LET gd=1: LET r=11: LET ct=0: LET dl=2: GO SUB 2500: PRINT "the goblin seized you and dragged you down into the dark. an iron door clangs shut behind you.": RETURN
3354 IF r=9 AND gd=0 THEN PRINT "the goblin sniffs about, baffled, and slinks back into the crack.": GO TO 3400
3356 IF gb>0 AND r>=12 AND r<=20 AND gbr<>r AND ct>1 AND RND<0.2 THEN LET gbr=r: PRINT "a goblin comes padding along the tunnel."
3358 IF gbr<>r THEN GO TO 3400
3360 IF thr=r AND th=1 AND RND<0.5 THEN PRINT "durrock's axe flashes. the goblin falls dead.": LET gbr=0: LET gb=gb-1: GO TO 3400
3361 IF thr=r AND th=1 AND RND<0.1 THEN PRINT "the goblin's knife finds durrock's throat. durrock is dead.": LET th=0
3362 IF wr=0 AND RND<0.6 THEN PRINT "the goblin slashes at you with a crooked knife.": LET hp=hp-1: IF hp<=0 THEN PRINT "you fall, and the goblins drag you away for good.": GO TO 4500
3364 IF wr=0 THEN PRINT "the goblin circles you, hissing."
3366 IF wr=1 THEN PRINT "the goblin peers about, puzzled, and pads away.": LET gbr=0
3400 IF wg=0 THEN GO TO 3450
3402 IF wlr<>r AND RND<0.3 THEN LET q=INT (RND*5)+1: LET wlr=VAL (wo$(q*2-1 TO q*2)): IF wlr=r THEN PRINT "a grey wolf comes loping out of the dusk, and circles you."
3404 IF wlr=r AND wr=1 THEN PRINT "the wolf sniffs the air, puzzled, and lopes away.": LET wlr=0: GO TO 3450
3406 IF wlr=r AND RND<0.5 THEN PRINT "the wolf snarls and snaps at you. its teeth tear your cloak.": LET hp=hp-1: IF hp<=0 THEN PRINT "the wolf's jaws close on your throat.": GO TO 4500
3408 IF wlr=r THEN PRINT "the wolf howls, and far off, others answer."
3450 IF r<26 OR r>38 THEN LET ar=0: GO TO 3550
3452 IF (r=28 OR r=32 OR r=36 OR r=37) AND ct<3 THEN PRINT "pale bulging eyes watch you from the branches."
3454 IF (r=28 OR r=32 OR r=36 OR r=37) AND ct>=3 THEN PRINT "something drops from above and bites. its venom works fast.": GO TO 4500
3456 IF r=33 AND ct>=3 THEN PRINT "the grey silk drifts down and wraps you round. you cannot breathe.": GO TO 4500
3458 IF r=33 AND ct=2 THEN PRINT "the webs stir, though there is no wind."
3460 IF r=38 AND ct>=3 THEN PRINT "the bog closes over your head.": GO TO 4500
3462 IF r=38 AND ct=1 THEN PRINT "you are sinking. the mud is up to your knees."
3463 IF r=38 AND ct=2 THEN PRINT "the mud is up to your waist, and pulling."
3464 IF ec=0 AND wr=0 AND ar=0 AND ct>=1 AND r<>35 AND RND<0.3 THEN LET ar=1: PRINT "an archer of the woodfolk steps from the trees, bow drawn.": GO TO 3550
3466 IF ar=1 AND wr=0 AND ec=0 THEN LET ec=1: LET ar=0: LET r=40: LET ct=0: LET dl=3: LET bt=4: LET dst(5)=0: GO SUB 2500: PRINT "the archer bound your hands and marched you here. somebody locks the red cellar door behind you.": RETURN
3468 IF ar=1 THEN PRINT "the archer stares at the empty air where you stood, and melts back into the trees.": LET ar=0
3550 IF r=39 AND wr=0 THEN LET ec=1: LET r=40: LET ct=0: LET dl=3: LET bt=4: LET dst(5)=0: GO SUB 2500: PRINT "the woodfolk guards seized you and threw you into this cell. somebody locks the red cellar door behind you.": RETURN
3552 IF r=39 THEN PRINT "the woodfolk feast and sing, and do not see you pass."
3554 IF r=40 AND bt>0 THEN LET bt=bt-1: IF bt=0 THEN PRINT "the butler, red-faced with wine, unlatches the red cellar door and shuffles off.": LET dst(5)=2
3556 IF r=40 AND bt>0 THEN PRINT "somewhere beyond the door, a cork pops and somebody laughs."
3558 IF r=41 AND ib=0 AND RND<0.3 THEN PRINT "the butler snores in his corner."
3560 IF r=41 AND ib=1 THEN LET bw=bw+1: IF bw>=2 THEN PRINT "the cellar hands come, grumbling, heave the hatch open and roll the barrels through. the river takes you.": LET dst(12)=2: LET r=42: LET bf=2: LET ct=0: RETURN
3600 IF r=42 AND ib=0 THEN PRINT "the current grabs you and smashes you against the iron grating.": GO TO 4500
3602 IF r=42 AND bf>0 THEN LET bf=bf-1: PRINT "you bob along in the dark, bumping and spinning..."
3603 IF r=42 AND bf=0 AND ib=1 THEN LET ib=0: LET be=1: LET r=46: LET ct=0: LET dl=3: GO SUB 2500: PRINT "the barrel ground onto the gravel here, and you climbed out, soaked and stiff.": RETURN
3650 IF sv=0 THEN GO TO 3700
3652 IF svr=r AND (r<17 OR r>20) THEN LET svr=0: GO TO 3700
3654 IF svr<>r AND r>=17 AND r<=20 AND RND<0.5 THEN LET svr=r: PRINT "sliver comes creeping out of the dark, eyes like two pale lamps."
3656 IF svr<>r THEN GO TO 3700
3658 IF ol(7)=r THEN PRINT "sliver snatches up the copper band and hides it in his rags.": LET ol(7)=98
3660 IF ol(7)=99 AND wr=0 AND rd<3 AND RND<0.25 THEN PRINT "sliver's long fingers pluck the copper band from your pocket!": LET ol(7)=98
3662 IF wr=1 THEN PRINT "sliver sniffs and mutters "" where is it? where has it gone? "".": GO TO 3700
3664 IF rd=0 THEN PRINT "sliver hisses "" what has it got hidden, my sweet? let us play a game of asking "".": LET rd=1: GO TO 3700
3666 IF rd=1 THEN GO SUB 3690: LET rd=2: LET rw=0: GO TO 3700
3668 IF rd=2 THEN LET rw=rw+1: PRINT "sliver waits, breathing softly, for an answer.": IF rw>=3 THEN PRINT "sliver loses patience. cold fingers close round your neck from behind.": GO TO 4500
3670 GO TO 3700
3690 IF rq=1 THEN PRINT "sliver says "" the more of me you take, the more you leave behind. what am i? "".": RETURN
3692 PRINT "sliver says "" i have a bed but never sleep, a mouth but never speak. what am i? "".": RETURN
3700 LET mt=mt+1: IF mt>=8 THEN LET mt=0
3702 LET dst(13)=1+(mt<2)
3704 IF (r=35 OR r=39) AND mt=0 THEN PRINT "with a soft click, the pale door swings open."
3706 IF (r=35 OR r=39) AND mt=2 THEN PRINT "the pale door swings shut, and the seam vanishes from the hillside."
3750 LET ht=ht+1: IF ht>=7 THEN LET ht=0
3752 LET dst(14)=1+(ht<2)
3754 IF (r=50 OR r=51) AND ht=0 THEN PRINT "a crack runs across the grey stone, and a dark hole opens in the wall."
3756 IF (r=50 OR r=51) AND ht=2 THEN PRINT "the stone grinds shut. the wall is smooth again."
3800 IF dg=2 THEN GO TO 3850
3802 IF r=53 AND dg=0 AND wr=0 AND hr<>r THEN PRINT "one great eye opens. a gout of flame fills the den.": GO TO 4500
3803 IF r=53 AND dg=0 AND wr=0 THEN PRINT "one great eye opens, and fixes on you. harl nocks a black arrow and shouts "" tell me when! "".": LET dg=1: LET dgr=53: LET dw=0: GO TO 3850
3804 IF r=53 AND dg=0 THEN PRINT "ashwyrm snores on. the copper band hides you from its gaze."
3806 IF dg=0 THEN GO TO 3850
3808 IF r>=51 AND dgr<>r AND RND<0.6 THEN LET dgr=r: PRINT "a red glow grows, and ashwyrm comes slithering after you, roaring."
3810 IF r<51 THEN LET df=df+1: IF dgr>=51 THEN LET dgr=0
3812 IF r<51 AND df=2 THEN PRINT "with a roar that shakes the hills, ashwyrm bursts from the crag and wheels into the sky."
3814 IF r<51 AND df=5 AND hf=0 THEN PRINT "far off over reedmere, fire rains on the town. then one black arrow flies. ashwyrm crashes into the lake, and the water boils.": LET dg=2: LET dk=1: LET dgr=0: GO TO 3850
3816 IF r<51 AND df>=5 AND hf=1 AND dgr<>r THEN LET dgr=r: PRINT "ashwyrm drops out of the sky and lands before you, wings spread."
3820 IF dgr=r AND wr=0 AND hr<>r THEN PRINT "ashwyrm sees you. there is a roar, a flash, and nothing more.": GO TO 4500
3822 IF dgr=r AND wr=0 THEN PRINT "ashwyrm rears up over you. harl nocks a black arrow and shouts "" tell me when! "".": LET dw=dw+1: IF dw>=3 THEN PRINT "too late. the fire comes first.": GO TO 4500
3824 IF dgr=r AND wr=1 THEN PRINT "ashwyrm sniffs the air and snarls "" i smell you, thief. i will find you ""."
3850 IF hf=1 AND hr<>r AND r<>42 THEN LET hr=r: PRINT "harl strides in after you, bow in hand."
3852 IF r=45 AND hf=0 AND ct=1 THEN PRINT "harl says "" the beast sleeps on its gold beneath the crag. none who woke it came back ""."
3854 IF r=45 AND hf=0 AND ct=2 THEN PRINT "harl says "" my black arrow has waited long for that beast. say the word, and i will come with you ""."
3900 IF r=21 AND ct=1 THEN PRINT "ursk looks you over and grunts "" eat, little one. the bread is behind the curtain. then go, and do not touch my bees ""."
3902 IF r=21 AND day=0 AND RND<0.3 THEN PRINT "outside, something very large growls, and paws at the door."
3904 IF r=6 AND ct=1 THEN PRINT "aelric says "" welcome, traveller. rest here, and eat ""."
3906 IF r=6 AND ol(14)=0 AND ct=2 THEN PRINT "aelric packs you a lunch for the road.": LET ol(14)=99
3908 IF r=6 AND em=1 AND mr=0 THEN GO SUB 4300
3990 RETURN
4300 PRINT "aelric studies the faded chart by moonlight."
4301 PRINT "aelric says "" the moon letters tell of a hidden way east from the shore of reedmere, of a back door to the goblin caves west of the treeless gap,";
4302 PRINT " and of a secret door in the grey wall below the crag, which opens for a moment and shuts again "".": LET mr=1: LET dst(11)=2: RETURN
4500 PRINT "you have died.": GO SUB 4600: PRINT "press any key to try again.": PAUSE 0: GO TO 23
4600 LET sc=5*(kt+st+mr)+10*(gw+rt+be)+15*(tt+dk)+25*won: PRINT "you have completed ";sc;"% of this quest.": IF hp<3 THEN PRINT "you are wounded."
4610 RETURN
4700 PRINT "you heave the sack of gold into the oak chest and shut the lid."'"your quest is done, and the burrow is yours again. put the kettle on.": LET won=1: GO SUB 4600: PRINT "press any key to play again.": PAUSE 0: GO TO 23
5550 IF w$(2)="boat" OR w$(2)="barrel" OR w$(2)="hole" THEN GO TO 6500
5552 GO SUB 1950: IF dr=0 THEN PRINT " go where ?": GO TO 8000
5554 GO SUB 2000: GO TO 8010
5600 GO SUB 2500: GO TO 8010
5650 IF ob=0 AND w$(2)="" THEN PRINT " take what ?": GO TO 8000
5652 IF ob=7 AND ol(7)=98 AND svr=r THEN PRINT " sliver has it, and clutches it tight.": GO TO 8000
5654 IF ob=0 THEN PRINT " there is no ";w$(2);" here.": GO TO 8000
5655 IF ol(ob)=99 THEN PRINT " you already have ";on$(ob);".": GO TO 8000
5656 IF ol(ob)<>r THEN PRINT " there is no ";w$(2);" here.": GO TO 8000
5658 IF dk THEN PRINT " it is too dark to find anything.": GO TO 8000
5660 IF of(ob)=1 THEN PRINT " ";on$(ob);" will not budge.": GO TO 8000
5662 IF ob=15 THEN PRINT "the sand runs through your fingers.": GO TO 8010
5664 LET ol(ob)=99: PRINT "you pick up ";on$(ob);".": IF ob=3 THEN LET kt=1
5666 IF ob=4 THEN LET st=1: PRINT "it gleams with a pale light of its own."
5668 IF ob=7 THEN LET rt=1
5670 IF ob<>12 THEN GO TO 8010
5672 LET tt=1: IF dg=2 THEN GO TO 8010
5674 PRINT "as you lift the sack, the hill of gold shifts and rings. one great eye opens.": LET dg=1: LET dgr=53: LET df=0
5676 IF wr=0 AND hr<>r THEN PRINT "ashwyrm sees you. there is a roar, a flash, and nothing more.": GO TO 4500
5677 IF wr=0 THEN PRINT "ashwyrm rears up. harl nocks a black arrow and shouts "" tell me when! "".": GO TO 8010
5678 PRINT "ashwyrm rears up and sniffs the air. it cannot see you, but it knows, and it is angry.": GO TO 8010
5700 IF ob=0 OR ol(ob)<>99 THEN PRINT " you are not carrying that.": GO TO 8000
5710 LET ol(ob)=r: PRINT "you put down ";on$(ob);".": IF ob=7 THEN LET wr=0
5715 IF ob=12 AND r=1 THEN PRINT "the gold belongs in the chest, not on the floor."
5720 GO TO 8010
5750 PRINT "you are carrying:": LET c=0: FOR i=1 TO 18: IF ol(i)=99 THEN PRINT on$(i);(" (worn)" AND (i=7 AND wr=1)): LET c=1
5760 NEXT i: IF c=0 THEN PRINT "      nothing at all"
5765 IF ib=1 THEN PRINT "you are inside a barrel."
5770 GO TO 8010
5800 IF w$(2)="chest" AND r=1 THEN LET co=1: PRINT "you lift the lid of the oak chest.": GO TO 8010
5802 IF w$(2)="hatch" AND r=41 AND ib=1 THEN PRINT " you cannot reach it from inside the barrel.": GO TO 8000
5803 IF w$(2)="hatch" AND r=41 THEN LET dst(12)=2: PRINT "you heave the hatch open. dark water rushes past below.": GO TO 8010
5804 IF w$(2)="curtain" AND r=21 THEN LET ol(8)=21: PRINT "behind the curtain is a larder, and on its shelf a loaf of honey bread.": GO TO 8010
5806 IF w$(2)="barrel" AND r=41 THEN PRINT "the barrel is open already. it smells of wine and is quite empty.": GO TO 8010
5808 IF w$(2)="window" THEN PRINT " the window is far above your reach.": GO TO 8000
5810 IF w$(2)="gate" AND r=49 THEN PRINT " it is choked with rubble.": GO TO 8000
5812 IF w$(2)<>"door" THEN PRINT " i see nothing here to open.": GO TO 8000
5814 GO SUB 1950: IF dr=0 THEN PRINT " i see no door here.": GO TO 8000
5815 IF dr=13 THEN PRINT " the pale door has no handle. it opens when it wishes to.": GO TO 8000
5816 IF dr=14 THEN PRINT " the wall is smooth stone.": GO TO 8000
5817 IF dr=15 THEN PRINT " it is choked with rubble.": GO TO 8000
5818 IF dr=4 THEN PRINT " the iron goblin door is bolted from the far side.": GO TO 8000
5819 IF dst(dr)=0 AND dr=2 AND ol(3)=99 THEN PRINT "the big iron key turns in the lock of the massive stone door.": LET dst(2)=1
5820 IF dst(dr)=0 THEN PRINT " the ";dm$(dr);" is locked.": GO TO 8000
5822 IF dst(dr)=2 THEN PRINT " the ";dm$(dr);" is already open.": GO TO 8000
5824 LET dst(dr)=2: PRINT "you open the ";dm$(dr);".": GO TO 8010
5850 IF w$(2)="chest" AND r=1 THEN LET co=0: PRINT "you close the oak chest.": GO TO 8010
5852 IF w$(2)="hatch" AND r=41 THEN LET dst(12)=1: PRINT "you let the hatch fall shut.": GO TO 8010
5854 GO SUB 1950: IF dr=0 OR dr>5 OR dst(dr)<>2 THEN PRINT " i see nothing here to close.": GO TO 8000
5856 LET dst(dr)=1: PRINT "you close the ";dm$(dr);".": GO TO 8010
5900 GO SUB 1950: IF dr=0 THEN PRINT " i see nothing here to unlock.": GO TO 8000
5902 IF dr=4 THEN PRINT " it is bolted from the far side.": GO TO 8000
5904 IF dr=5 THEN PRINT " there is no keyhole on this side.": GO TO 8000
5906 IF dr<>2 OR ol(3)<>99 THEN PRINT " you have nothing that fits this lock.": GO TO 8000
5908 IF dst(2)>0 THEN PRINT " it is not locked.": GO TO 8000
5910 LET dst(2)=1: PRINT "the big iron key turns in the lock of the massive stone door.": GO TO 8010
5950 LET c$=w$(2): IF c$="durrock" AND th=1 AND thr=r THEN GO TO 5970
5952 IF c$="aelric" AND r=6 THEN GO TO 5985
5954 IF c$="sliver" AND svr=r THEN GO TO 6850
5956 IF c$="harl" AND hr=r THEN GO TO 5990
5958 IF c$="wendel" AND gl=r THEN PRINT "wendel says "" you are doing better than i expected. the chart is the thing. aelric can read it "".": GO TO 8010
5960 IF c$="ursk" AND r=21 THEN PRINT "ursk grunts "" the bread is behind the curtain. do not touch anything else "".": GO TO 8010
5962 IF c$="butler" AND r=41 THEN PRINT "the butler snores.": GO TO 8010
5964 PRINT " there is no ";c$;" here to talk to.": GO TO 8000
5970 IF w$(3)="open" AND w$(4)="window" AND r=11 THEN PRINT "durrock stretches up and forces the window open.": LET dst(3)=2: GO TO 8010
5972 IF w$(3)="carry" THEN PRINT "durrock sighs and hoists you onto his shoulders. "" now what? "" he says.": GO TO 8010
5974 IF (w$(3)="go" OR w$(3)="climb") AND w$(4)="window" AND r=11 AND dst(3)=2 THEN LET d=4: GO SUB 2000: GO TO 8010
5976 IF (w$(3)="kill" OR w$(3)="attack") AND gbr=r THEN PRINT "durrock's axe flashes. the goblin falls dead.": LET gbr=0: LET gb=gb-1: GO TO 8010
5978 IF w$(3)="kill" OR w$(3)="attack" THEN PRINT "durrock says "" kill what? "".": GO TO 8010
5980 PRINT "durrock says "" no "".": GO TO 8010
5985 IF (w$(3)="read" OR w$(3)="examine") AND w$(4)="chart" AND (ol(1)=99 OR em=1) THEN GO SUB 4300: GO TO 8010
5987 PRINT "aelric says "" ask me something i can help with "".": GO TO 8010
5990 IF w$(3)="follow" OR w$(3)="come" THEN LET hf=1: PRINT "harl says "" lead on. my arrow is ready "".": GO TO 8010
5992 IF w$(3)="shoot" OR w$(3)="kill" OR w$(3)="fire" THEN GO TO 6900
5994 IF w$(3)="stay" OR w$(3)="wait" THEN LET hf=0: PRINT "harl says "" i will keep watch over the lake "".": GO TO 8010
5996 PRINT "harl says "" i am a plain man. say it plainly "".": GO TO 8010
6000 PRINT "you bide your time."'"the moments drift by...": GO TO 8010
6050 LET c$=w$(2): LET en=0: IF c$="wolf" AND wlr=r AND wg=1 THEN LET en=1: LET es=3
6052 IF c$="goblin" AND gbr=r THEN LET en=2: LET es=2
6054 IF c$="sliver" AND svr=r THEN LET en=3: LET es=2
6056 IF c$="archer" AND ar=1 THEN LET en=4: LET es=4
6058 IF c$="ogre" AND r=3 AND og=1 THEN PRINT "the fat ogre grabs you and swallows you whole.": GO TO 4500
6060 IF c$="ashwyrm" AND (dgr=r OR (r=53 AND dg=0)) THEN PRINT "you strike at the dragon. the blade skids off its armour of gems, and the answer is a wall of fire.": GO TO 4500
6064 IF c$="durrock" AND thr=r AND th=1 THEN PRINT "you swing at durrock."'"durrock is quicker. his axe ends the argument.": GO TO 4500
6066 IF (c$="harl" AND hr=r) OR (c$="ursk" AND r=21) OR (c$="aelric" AND r=6) OR (c$="wendel" AND gl=r) THEN PRINT "that would be foolish, and ungrateful.": GO TO 8010
6068 IF en=0 THEN PRINT " there is no ";c$;" here to fight.": GO TO 8000
6070 LET q=INT (RND*4)+1+4*(ol(4)=99): IF q<=es THEN PRINT "you lash out at the ";c$;". it dodges, and strikes back.": LET hp=hp-1: IF hp<=0 THEN PRINT "that blow was one too many. you fall.": GO TO 4500
6072 IF q<=es THEN GO TO 8010
6074 PRINT "you strike at the ";c$;(" with the bright blade" AND ol(4)=99);"."'"one clean blow, and the ";c$;" falls dead."
6076 IF en=1 THEN LET wg=0: LET wlr=0
6078 IF en=2 THEN LET gbr=0: LET gb=gb-1
6080 IF en=3 THEN LET sv=0: LET svr=0: IF ol(7)=98 THEN LET ol(7)=r: PRINT "a small bright thing rolls from his rags."
6082 IF en=4 THEN LET ar=0: PRINT "the woodfolk will not forget this."
6084 GO TO 8010
6100 IF ob=1 AND ol(1)=99 THEN PRINT "you unroll the faded chart."'"it shows the road east, and there are strange marks along one edge that you cannot read.": GO TO 8010
6102 IF ob=2 AND r=1 AND co=1 THEN PRINT "it is a stout oak chest. the lid is open.": GO TO 8010
6104 IF ob=2 AND r=1 THEN PRINT "it is a stout oak chest. the lid is shut.": GO TO 8010
6106 IF ob=7 AND (ol(7)=99 OR ol(7)=r) THEN PRINT "a plain band of dull copper. it is warm to the touch, and seems to weigh more than it should.": GO TO 8010
6108 IF ob=15 AND r=11 THEN PRINT "you dig in the sand. there is nothing under it but more sand, and a very old bone.": GO TO 8010
6110 IF ob=18 AND r=11 THEN PRINT "the window is small, barred, and far above your head. a dwarf could reach it.": GO TO 8010
6112 IF ob=17 AND r=41 THEN PRINT "the hatch is iron, and heavy. the barrels go out this way, to the river.": GO TO 8010
6114 IF (w$(2)="wall" OR w$(2)="stone") AND r=50 THEN PRINT "a hairline seam runs across the smooth grey stone, as if a door were drawn there and forgotten.": GO TO 8010
6116 IF w$(2)="gate" AND r=49 THEN PRINT "the gate is choked with fallen rock, and scalding vapour breathes out of it.": GO TO 8010
6118 IF w$(2)="web" THEN PRINT "the strands are thick as cord, and sticky. only a blade would part them.": GO TO 8010
6120 IF w$(2)="door" THEN GO SUB 1950: IF dr>0 AND dr<=5 THEN PRINT "the ";dm$(dr);" is ";("open" AND dst(dr)=2);("shut" AND dst(dr)=1);("locked" AND dst(dr)=0);".": GO TO 8010
6121 IF w$(2)="door" THEN PRINT "it is a door of a kind you have not met before.": GO TO 8010
6122 IF ob>0 AND (ol(ob)=r OR ol(ob)=99) THEN PRINT "you look closely at ";on$(ob);"."'"it is just what it seems to be.": GO TO 8010
6124 PRINT " there is no ";w$(2);" here.": GO TO 8000
6150 PRINT "move with n s e w ne nw se sw u d or go ";
6151 PRINT "<direction>."'"useful words: look, take, drop, inventory, open, close, unlock, examine, wait, kill, wear, remove, break, throw, put, climb, cross, give, eat, drink, pull, answer, shoot, score, quit (or loader)."
6152 PRINT "to ask a companion, say to durrock ""open window"", say to harl ""follow me"", say to sliver ""<answer>""."'"bring the dragons gold home and put it in the chest.": GO TO 8000
6200 GO SUB 4600: PRINT "press R to start again, or any other key for the loader."
6210 IF INKEY$<>"" THEN PAUSE 1: GO TO 6210
6220 LET k$=INKEY$: IF k$="" THEN PAUSE 1: GO TO 6220
6230 IF k$="r" OR k$="R" THEN GO TO 23
6240 LOADER
6250 IF ob=7 AND ol(7)=99 THEN LET wr=1: LET rtm=12: PRINT "you slip the copper band on your finger and fade from sight.": IF svr=r THEN PRINT "sliver shrieks "" where is it? thief! thief! ""."
6252 IF ob=7 AND ol(7)=99 THEN GO TO 8010
6254 PRINT " you cannot wear that.": GO TO 8000
6300 IF ob=7 AND wr=1 THEN LET wr=0: PRINT "you take off the copper band and flicker back into view.": GO TO 8010
6310 PRINT " you are not wearing that.": GO TO 8000
6350 IF w$(2)="window" THEN PRINT "you rattle the bars of the window. nothing gives.": GO TO 8010
6352 IF w$(2)="door" THEN PRINT "the door is far too stout for you.": GO TO 8010
6354 LET dr=0: FOR j=1 TO LEN e$(r) STEP 4: IF e$(r)(j+1)>="6" AND e$(r)(j+1)<="9" THEN LET dr=VAL (e$(r)(j+1))
6356 NEXT j: IF dr=0 OR dst(dr)=2 THEN PRINT " there is no web here.": GO TO 8000
6358 IF ol(4)<>99 THEN PRINT " the web is too tough to tear by hand.": GO TO 8000
6360 PRINT "you slash the web apart with the bright blade.": LET dst(dr)=2: GO TO 8010
6400 IF ob=5 AND ol(5)=99 AND r=30 THEN GO TO 6800
6402 IF ob=5 AND ol(5)<>99 THEN PRINT " you are not carrying the rope.": GO TO 8000
6404 IF ob>0 AND ol(ob)=99 THEN PRINT "you throw ";on$(ob);". it lands at your feet.": LET ol(ob)=r: GO TO 8010
6406 PRINT " that would achieve nothing here.": GO TO 8000
6450 IF ob=7 AND w$(3)="on" THEN GO TO 6250
6452 IF ob<>12 OR ol(12)<>99 OR r<>1 THEN PRINT " that would achieve nothing here.": GO TO 8000
6454 IF co=0 THEN PRINT " the chest is shut.": GO TO 8000
6456 GO TO 4700
6500 IF w$(2)="" AND ib=1 THEN LET ib=0: LET bw=0: PRINT "you climb out of the barrel.": GO TO 8010
6502 IF w$(2)="barrel" AND r=41 AND ib=1 THEN PRINT " you are in it already.": GO TO 8000
6504 IF w$(2)="barrel" AND r=41 THEN LET ib=1: LET bw=0: PRINT "you squeeze into the empty barrel and pull the lid to. it is dark, and smells of wine.": GO TO 8010
6506 IF w$(2)="boat" AND (r=30 OR r=31) THEN LET d=3+(r=31): GO SUB 2000: GO TO 8010
6508 IF w$(2)="window" AND r=11 THEN LET d=4: GO SUB 2000: GO TO 8010
6510 IF w$(2)="hole" AND (r=50 OR r=51) THEN LET d=3+(r=51): GO SUB 2000: GO TO 8010
6512 IF w$(2)="tree" THEN PRINT "you climb a little way, see only more trees, and come down again.": GO TO 8010
6514 PRINT " you cannot climb that.": GO TO 8000
6550 IF (ob=8 OR ob=14) AND ol(ob)=99 THEN LET ol(ob)=0: LET hg=0: LET hp=3: PRINT "you eat ";on$(ob);". much better.": GO TO 8010
6552 IF (ob=8 OR ob=14) AND ol(ob)=r THEN PRINT " you had better pick it up first.": GO TO 8000
6554 PRINT " you cannot eat that.": GO TO 8000
6600 IF ob=11 AND (ol(11)=r OR ol(11)=99) THEN PRINT "you drink deep of the strong wine. the room spins, and you sleep a while.": GO SUB 3000: GO SUB 3000: GO TO 8010
6602 IF r=22 OR r=24 OR r=29 OR r=46 THEN PRINT "you drink. the water is cold and sweet.": GO TO 8010
6604 PRINT " there is nothing here to drink.": GO TO 8000
6650 GO SUB 4600: GO TO 8000
6700 IF r=42 THEN PRINT "the current grabs you and smashes you against the iron grating.": GO TO 4500
6702 IF r=30 OR r=31 THEN LET d=3+(r=31): GO SUB 2000: GO TO 8010
6704 IF r=22 OR r=24 OR r=29 THEN PRINT " the water is too wide and too fast.": GO TO 8000
6706 PRINT " there is no water here to cross.": GO TO 8000
6750 IF ob=1 AND ol(1)=99 AND r=6 THEN PRINT "you hand the faded chart to aelric.": LET ol(1)=0: LET em=1: PRINT "aelric says "" my thanks. let me look at this "".": GO TO 8010
6752 IF (ob=8 OR ob=14) AND ol(ob)=99 AND thr=r AND th=1 THEN PRINT "durrock says "" i am not hungry. keep it "".": GO TO 8010
6754 IF ob>0 AND ol(ob)=99 THEN PRINT "nobody here wants ";on$(ob);".": GO TO 8010
6756 PRINT " you have nothing like that to give.": GO TO 8000
6800 IF ol(5)<>99 THEN PRINT " you are not carrying the rope.": GO TO 8000
6802 IF r<>30 THEN PRINT " there is nothing here to pull it against.": GO TO 8000
6804 IF dst(10)=2 THEN PRINT " the boat is already on this side.": GO TO 8000
6806 PRINT "you hurl the rope across the black water. it snags the little boat on the far side, and you haul it over.": LET dst(10)=2: LET ol(13)=30: GO TO 8010
6850 IF svr<>r OR rd<>2 THEN PRINT " nobody is waiting for an answer.": GO TO 8000
6852 LET ok=0: FOR i=2 TO 4: IF rq=1 AND (w$(i)="footsteps" OR w$(i)="steps" OR w$(i)="footprints") THEN LET ok=1
6854 IF rq=2 AND w$(i)="river" THEN LET ok=1
6856 NEXT i: IF ok=0 THEN PRINT "sliver screams "" wrong, wrong! "" and cold fingers close round your throat from behind.": GO TO 4500
6858 PRINT "sliver wails "" it knows, it knows! "" and scuttles away into the dark.": LET sv=0: LET svr=0: LET rd=3: IF ol(7)=98 THEN PRINT "something small and bright drops from his rags as he goes.": LET ol(7)=r
6860 GO TO 8010
6900 IF hr<>r THEN PRINT " you have no bow, and harl is not here.": GO TO 8000
6902 IF dgr<>r OR dg<>1 THEN PRINT "harl says "" i see no mark worth an arrow "".": GO TO 8010
6904 PRINT "harl draws the great bow to his ear. the black arrow sings, and finds the one bare patch on the dragons breast."'"ashwyrm screams, thrashes, and lies still. the beast is dead.": LET dg=2: LET dk=1: LET dgr=0: GO TO 8010
6950 PRINT "you curl up and doze a while.": GO SUB 3000: GO SUB 3000: GO TO 8010
8000 GO TO 200
8010 GO SUB 3000: GO TO 200
9800 FX "beginFill", #A0A0A0, 100: FX "moveTo", px-pw, 72: FX "lineTo", px, py: FX "lineTo", px+pw, 72: FX "lineTo", px-pw, 72: FX "endFill": FX "lineStyle", 1, #000000, 100: FX "moveTo", px-pw, 72: FX "lineTo", px, py: FX "lineTo", px+pw, 72: RETURN
9805 FX "beginFill", #FFFFFF, 100: FX "moveTo", px-pw/4, py+(72-py)/4: FX "lineTo", px, py: FX "lineTo", px+pw/4, py+(72-py)/4: FX "lineTo", px-pw/4, py+(72-py)/4: FX "endFill": RETURN
9810 FX "lineStyle", 2, #000000, 100: FX "moveTo", tx, ty: FX "lineTo", tx, ty-tz: FX "beginFill", #00A000, 100: FX "moveTo", tx-tz/2, ty-tz/2: FX "lineTo", tx, ty-tz-4: FX "lineTo", tx+tz/2, ty-tz/2: FX "lineTo", tx-tz/2, ty-tz/2
9811 FX "endFill": RETURN
9820 FX "beginFill", #0000D8, 100: FX "moveTo", 0, wy: FX "lineTo", 255, wy: FX "lineTo", 255, 79: FX "lineTo", 0, 79: FX "endFill": FX "lineStyle", 1, #00D8D8, 100: FOR i=1 TO 4: FX "moveTo", 10+i*30, wy+i*5: FX "lineTo", 40+i*30, wy+i*5
9821 NEXT i: RETURN
9830 FX "lineStyle", 1, #000000, 100: FOR i=0 TO 7: FX "moveTo", cx, cy: FX "lineTo", cx+cr*COS (i*0.785), cy+cr*SIN (i*0.785): NEXT i
9832 FOR j=1 TO 3: FX "moveTo", cx+cr*j/3, cy: FOR i=1 TO 8: FX "lineTo", cx+cr*j/3*COS (i*0.785), cy+cr*j/3*SIN (i*0.785): NEXT i: NEXT j: RETURN
9840 FX "beginFill", fc, 100: FX "moveTo", 0, 0: FX "lineTo", 255, 0: FX "lineTo", 255, 79: FX "lineTo", 0, 79: FX "lineTo", 0, 0: FX "endFill": RETURN
9850 FX "beginFill", #00A000, 100: FX "moveTo", 0, 79: FX "lineTo", 0, 62: FX "curveTo", 60, hy, 128, 60: FX "curveTo", 190, hy+10, 255, 65: FX "lineTo", 255, 79: FX "lineTo", 0, 79: FX "endFill": RETURN
9860 FX "beginFill", fc, 100: FX "moveTo", sx+sr, sy: FOR i=1 TO 12: FX "lineTo", sx+sr*COS (i*0.5236), sy+sr*SIN (i*0.5236): NEXT i: FX "endFill": RETURN
9870 FX "lineStyle", 1, #000000, 100: FX "moveTo", 0, 72: FX "lineTo", 255, 72: RETURN
9880 FX "beginFill", fc, 100: FX "moveTo", kx, ky: FX "lineTo", kx+kw, ky: FX "lineTo", kx+kw, ky+kh: FX "lineTo", kx, ky+kh: FX "lineTo", kx, ky: FX "endFill": RETURN
9900 IF pc(r)=0 THEN RETURN
9902 FX "lineStyle", 1, #000000, 100: GO SUB 10000+pc(r)*50
9904 IF day=0 AND (r<=4 OR r=6 OR r=7 OR r=8 OR r=10 OR (r>=21 AND r<=38) OR (r>=43 AND r<=50)) THEN FX "beginFill", #000040, 45: FX "moveTo", 0, 0: FX "lineTo", 255, 0: FX "lineTo", 255, 79: FX "lineTo", 0, 79: FX "endFill"
9906 IF r=53 AND dg<2 THEN SPRITE "dragon", 150, 4, 100, 100, 0, 100
9908 IF r=53 AND dg=2 THEN SPRITE "dragon", 230, 72, 100, 100, 180, 70
9910 IF ol(7)=r AND NOT dk THEN SPRITE "ring", 120, 58
9912 IF ol(3)=r THEN SPRITE "key", 96, 58
9914 RETURN
10050 LET fc=#E8D0A0: GO SUB 9840: GO SUB 9870: LET fc=#00A000: LET sx=200: LET sy=42: LET sr=26: GO SUB 9860: LET fc=#D8D800: LET sx=212: LET sr=3: GO SUB 9860
10052 LET fc=#00D8D8: LET sx=60: LET sy=28: LET sr=13: GO SUB 9860: FX "lineStyle", 1, #000000, 100: FX "moveTo", 47, 28: FX "lineTo", 73, 28: FX "moveTo", 60, 15: FX "lineTo", 60, 41
10054 LET fc=#A05000: LET kx=20: LET ky=54: LET kw=44: LET kh=18: GO SUB 9880: FX "lineStyle", 1, #000000, 100: FX "moveTo", 20, 54: FX "lineTo", 64, 54: FX "lineTo", 64, 72: FX "moveTo", 20, 60: FX "lineTo", 64, 60: RETURN
10100 LET px=180: LET py=18: LET pw=55: GO SUB 9800: LET px=90: LET py=30: LET pw=45: GO SUB 9800: LET hy=30: GO SUB 9850
10102 LET fc=#D8D800: LET sx=36: LET sy=14: LET sr=8: GO SUB 9860: FX "lineStyle", 1, #000000, 100: FX "moveTo", 110, 79: FX "lineTo", 135, 62: FX "moveTo", 150, 79: FX "lineTo", 140, 62: RETURN
10150 LET fc=#00A000: LET kx=0: LET ky=58: LET kw=255: LET kh=21: GO SUB 9880: LET tx=20: LET ty=60: LET tz=30: GO SUB 9810: LET tx=232: LET tz=34: GO SUB 9810: LET tx=60: LET ty=56: LET tz=22: GO SUB 9810
10152 IF og=1 THEN FX "lineStyle", 2, #A05000, 100: FX "moveTo", 110, 70: FX "lineTo", 150, 70: FX "moveTo", 115, 72: FX "lineTo", 145, 64: FX "beginFill", #D80000, 100: FX "moveTo", 118, 68: FX "lineTo", 130, 40: FX "lineTo", 142, 68
10153 IF og=1 THEN FX "endFill": FX "beginFill", #D8D800, 100: FX "moveTo", 124, 68: FX "lineTo", 130, 52: FX "lineTo", 136, 68: FX "endFill"
10154 IF og=0 THEN LET fc=#A0A0A0: LET sx=112: LET sy=52: LET sr=13: GO SUB 9860: LET sx=152: LET sy=48: LET sr=16: GO SUB 9860: LET sx=112: LET sy=36: LET sr=7: GO SUB 9860: LET sx=152: LET sy=28: LET sr=8: GO SUB 9860
10156 RETURN
10200 LET fc=#404040: GO SUB 9840: FX "beginFill", #808080, 100: FX "moveTo", 70, 79: FX "curveTo", 128, -20, 186, 79: FX "lineTo", 70, 79: FX "endFill"
10202 FX "beginFill", #000000, 100: FOR i=1 TO 6: FX "moveTo", i*36-10, 0: FX "lineTo", i*36, 14+(i-INT (i/2)*2)*8: FX "lineTo", i*36+10, 0: NEXT i: FX "endFill": RETURN
10250 LET hy=35: GO SUB 9850: FX "lineStyle", 3, #0000D8, 100: FX "moveTo", 0, 62: FX "curveTo", 90, 70, 255, 76: FX "lineStyle", 2, #A05000, 100: FX "moveTo", 100, 68: FX "curveTo", 128, 50, 156, 70: FX "moveTo", 100, 68
10251 FX "lineTo", 100, 76: FX "moveTo", 156, 70: FX "lineTo", 156, 78
10252 LET fc=#D8D800: LET kx=190: LET ky=48: LET kw=26: LET kh=16: GO SUB 9880: FX "beginFill", #D80000, 100: FX "moveTo", 186, 48: FX "lineTo", 203, 36: FX "lineTo", 220, 48: FX "endFill": LET fc=#D8D800: LET sx=30: LET sy=12: LET sr=8
10253 GO SUB 9860: RETURN
10300 LET px=50: LET py=14: LET pw=60: GO SUB 9800: GO SUB 9805: LET px=140: LET py=4: LET pw=70: GO SUB 9800: GO SUB 9805: LET px=222: LET py=20: LET pw=50: GO SUB 9800: GO SUB 9805
10302 FX "lineStyle", 1, #000000, 100: FX "moveTo", 0, 79: FX "curveTo", 100, 70, 255, 76: RETURN
10350 FX "beginFill", #606060, 100: FX "moveTo", 0, 0: FX "lineTo", 95, 0: FX "lineTo", 70, 79: FX "lineTo", 0, 79: FX "endFill": FX "lineStyle", 2, #000000, 100: FX "moveTo", 95, 0: FX "lineTo", 70, 79
10352 LET ty=78: LET tz=8: FOR i=1 TO 5: LET tx=100+i*28: GO SUB 9810: NEXT i: FX "lineStyle", 1, #A0A0A0, 100: FX "moveTo", 90, 50: FX "curveTo", 170, 40, 255, 55: FX "moveTo", 110, 62: FX "curveTo", 180, 52, 255, 66: RETURN
10400 LET fc=#606060: GO SUB 9840: LET fc=#00D8D8: LET kx=100: LET ky=8: LET kw=56: LET kh=34: GO SUB 9880: FX "lineStyle", 3, #000000, 100: FOR i=1 TO 3: FX "moveTo", 100+i*14, 8: FX "lineTo", 100+i*14, 42: NEXT i
10402 FX "lineStyle", 1, #D8D800, 100: FOR i=1 TO 9: FX "moveTo", 10+i*22, 79: FX "lineTo", 20+i*22, 64: NEXT i: RETURN
10450 LET fc=#202020: GO SUB 9840: FX "beginFill", #585858, 100: FX "moveTo", 90, 79: FX "lineTo", 70, 40: FX "lineTo", 100, 10: FX "lineTo", 150, 8: FX "lineTo", 185, 45: FX "lineTo", 170, 79: FX "endFill"
10452 FX "beginFill", #101010, 100: FX "moveTo", 112, 79: FX "lineTo", 104, 48: FX "lineTo", 128, 30: FX "lineTo", 152, 50: FX "lineTo", 146, 79: FX "endFill": RETURN
10500 LET fc=#303030: GO SUB 9840: FOR i=1 TO 4: FX "lineStyle", 3, #A05000, 100: FX "moveTo", 30+i*50, 72: FX "lineTo", 30+i*50, 46: LET fc=#D8D800: LET sx=30+i*50: LET sy=40: LET sr=6: GO SUB 9860: LET fc=#D80000: LET sy=36: LET sr=3
10501 GO SUB 9860: NEXT i
10502 FX "beginFill", #000000, 100: FOR i=1 TO 7: FX "moveTo", i*32-12, 0: FX "lineTo", i*32, 12+(i-INT (i/3)*3)*5: FX "lineTo", i*32+12, 0: NEXT i: FX "endFill": RETURN
10550 LET fc=#101020: GO SUB 9840: FX "beginFill", #000060, 100: FX "moveTo", 0, 44: FX "lineTo", 255, 44: FX "lineTo", 255, 79: FX "lineTo", 0, 79: FX "endFill": FX "lineStyle", 1, #00D8D8, 100: FOR i=1 TO 5: FX "moveTo", i*40-20, 48+i*5
10551 FX "lineTo", i*40+10, 48+i*5: NEXT i
10552 LET fc=#FFFFFF: LET sx=198: LET sy=28: LET sr=3: GO SUB 9860: LET sx=210: GO SUB 9860: FX "lineStyle", 1, #808080, 100: FX "moveTo", 0, 30: FX "curveTo", 60, 10, 128, 32: FX "curveTo", 190, 50, 255, 20: RETURN
10600 LET fc=#C08040: GO SUB 9840: FX "lineStyle", 4, #602000, 100: FOR i=1 TO 3: FX "moveTo", i*64-20, 0: FX "lineTo", i*64-20, 79: NEXT i: FX "moveTo", 0, 14: FX "lineTo", 255, 14: FX "moveTo", 0, 44: FX "lineTo", 255, 44
10602 LET fc=#D80000: LET kx=170: LET ky=18: LET kw=40: LET kh=52: GO SUB 9880: LET fc=#602000: LET kx=50: LET ky=56: LET kw=70: LET kh=6: GO SUB 9880: FX "lineStyle", 3, #602000, 100: FX "moveTo", 56, 62: FX "lineTo", 56, 76
10603 FX "moveTo", 114, 62: FX "lineTo", 114, 76: RETURN
10650 LET hy=40: GO SUB 9850: LET wy=56: GO SUB 9820: FX "lineStyle", 3, #A05000, 100: FX "moveTo", 60, 56: FX "curveTo", 128, 30, 196, 56: FX "moveTo", 60, 56: FX "lineTo", 60, 72: FX "moveTo", 196, 56: FX "lineTo", 196, 72
10652 FX "lineStyle", 1, #A05000, 100: FX "moveTo", 60, 50: FX "curveTo", 128, 24, 196, 50: FOR i=1 TO 5: FX "moveTo", 48+i*22, 52-(i-INT (i/3)*3)*6: FX "lineTo", 48+i*22, 40-(i-INT (i/3)*3)*6: NEXT i: RETURN
10700 LET px=128: LET py=6: LET pw=150: GO SUB 9800: GO SUB 9805: LET fc=#707070: LET sx=40: LET sy=66: LET sr=9: GO SUB 9860: LET sx=200: LET sy=70: LET sr=7: GO SUB 9860: LET sx=150: LET sy=64: LET sr=5: GO SUB 9860
10702 FX "lineStyle", 1, #000000, 100: FOR i=1 TO 3: FX "moveTo", 180+i*18, 12+i*4: FX "lineTo", 186+i*18, 16+i*4: FX "lineTo", 192+i*18, 12+i*4: NEXT i: RETURN
10750 LET fc=#004000: GO SUB 9840: FX "beginFill", #000000, 100: FX "moveTo", 90, 79: FX "lineTo", 90, 32: FX "lineTo", 128, 14: FX "lineTo", 166, 32: FX "lineTo", 166, 79: FX "endFill"
10752 LET fc=#602000: LET kx=28: LET ky=0: LET kw=30: LET kh=79: GO SUB 9880: LET kx=198: GO SUB 9880: FX "lineStyle", 1, #00A000, 100: FX "moveTo", 0, 20: FX "curveTo", 128, -10, 255, 20: RETURN
10800 FX "lineStyle", 1, #000000, 100: FX "moveTo", 0, 79: FX "lineTo", 118, 42: FX "moveTo", 255, 79: FX "lineTo", 138, 42: FX "moveTo", 0, 42: FX "lineTo", 255, 42
10802 LET ty=72: LET tx=20: LET tz=44: GO SUB 9810: LET tx=236: GO SUB 9810: LET ty=60: LET tx=70: LET tz=26: GO SUB 9810: LET tx=186: GO SUB 9810: LET ty=50: LET tx=100: LET tz=14: GO SUB 9810: LET tx=156: GO SUB 9810: RETURN
10850 LET fc=#002000: GO SUB 9840: FX "lineStyle", 5, #000000, 100: FOR i=1 TO 6: FX "moveTo", i*40-15, 0: FX "lineTo", i*40-15, 79: NEXT i
10852 LET fc=#FFFFFF: LET sr=2: LET sx=85: LET sy=30: GO SUB 9860: LET sx=93: GO SUB 9860: LET sx=180: LET sy=20: GO SUB 9860: LET sx=188: GO SUB 9860: LET sx=140: LET sy=50: GO SUB 9860: LET sx=148: GO SUB 9860: RETURN
10900 LET fc=#606060: GO SUB 9840: LET wy=60: GO SUB 9820: FX "lineStyle", 2, #FFFFFF, 100: FOR i=1 TO 7: FX "moveTo", 104+i*6, 0: FX "lineTo", 104+i*6, 60: NEXT i
10902 LET fc=#FFFFFF: LET sr=3: FOR i=1 TO 5: LET sx=95+i*12: LET sy=58+(i-INT (i/2)*2)*6: GO SUB 9860: NEXT i: RETURN
10950 LET hy=30: GO SUB 9850: FX "beginFill", #000040, 100: FX "moveTo", 0, 36: FX "lineTo", 255, 36: FX "lineTo", 255, 64: FX "lineTo", 0, 64: FX "endFill": LET ty=36: LET tz=14: FOR i=1 TO 5: LET tx=i*45-20: GO SUB 9810: NEXT i
10952 LET by=66: IF ol(13)=31 THEN LET by=28
10954 FX "beginFill", #A05000, 100: FX "moveTo", 110, by: FX "lineTo", 146, by: FX "lineTo", 138, by+7: FX "lineTo", 118, by+7: FX "lineTo", 110, by: FX "endFill": RETURN
11000 LET ty=79: LET tz=50: LET tx=28: GO SUB 9810: LET tx=228: GO SUB 9810: LET cx=92: LET cy=36: LET cr=28: GO SUB 9830: LET cx=176: LET cy=42: LET cr=22: GO SUB 9830
11002 LET fc=#000000: LET sx=176: LET sy=42: LET sr=4: GO SUB 9860: FX "lineStyle", 1, #000000, 100: FOR i=1 TO 4: FX "moveTo", 176, 42: FX "lineTo", 164+i*6, 30: FX "moveTo", 176, 42: FX "lineTo", 164+i*6, 54: NEXT i: RETURN
11050 LET hy=20: GO SUB 9850: LET fc=#A0A0A0: LET ky=42: LET kw=12: LET kh=30: FOR i=1 TO 4: LET kx=10+i*40+(i>2)*60: GO SUB 9880: NEXT i
11052 LET fc=#E8E0C0: IF dst(13)=2 THEN LET fc=#000000
11054 LET kx=112: LET ky=30: LET kw=32: LET kh=42: GO SUB 9880: FX "lineStyle", 1, #000000, 100: FX "moveTo", 112, 72: FX "lineTo", 112, 30: FX "lineTo", 144, 30: FX "lineTo", 144, 72: RETURN
11100 LET fc=#605020: LET kx=0: LET ky=40: LET kw=255: LET kh=39: GO SUB 9880: LET fc=#0000D8: LET sr=8: LET sx=60: LET sy=60: GO SUB 9860: LET sx=170: LET sy=66: LET sr=11: GO SUB 9860
11102 FX "lineStyle", 1, #00A000, 100: FOR i=1 TO 12: FX "moveTo", i*20, 79: FX "lineTo", i*20+3, 46: NEXT i: FX "lineStyle", 2, #C0C0C0, 100: FX "moveTo", 0, 30: FX "curveTo", 128, 20, 255, 32: RETURN
11150 LET fc=#FFF0C0: GO SUB 9840: FX "lineStyle", 2, #A05000, 100: FOR i=1 TO 5: FX "moveTo", i*40-6, 79: FX "lineTo", i*40-6, 20: FX "moveTo", i*40+6, 79: FX "lineTo", i*40+6, 20: FX "moveTo", i*40+6, 20
11151 FX "curveTo", i*40+20, 4, i*40+34, 20: NEXT i
11152 LET fc=#D8D800: LET sr=3: LET sy=12: FOR i=1 TO 4: LET sx=i*40+20: GO SUB 9860: NEXT i: RETURN
11200 LET fc=#303030: GO SUB 9840: LET fc=#D80000: LET kx=100: LET ky=20: LET kw=50: LET kh=55: GO SUB 9880: LET fc=#000000: LET sx=140: LET sy=48: LET sr=3: GO SUB 9860
11202 FX "lineStyle", 1, #D8D800, 100: FOR i=1 TO 6: FX "moveTo", i*12, 79: FX "lineTo", i*12+6, 68: NEXT i: RETURN
11250 LET fc=#604020: GO SUB 9840: LET fc=#A06020: LET ky=30: LET kw=30: LET kh=38: FOR i=1 TO 3: LET kx=25+i*50: GO SUB 9880: FX "lineStyle", 1, #000000, 100: FX "moveTo", kx, 40: FX "lineTo", kx+30, 40: FX "moveTo", kx, 58
11251 FX "lineTo", kx+30, 58: NEXT i
11252 LET fc=#202020: IF dst(12)=2 THEN LET fc=#000000
11254 LET kx=190: LET ky=56: LET kw=44: LET kh=18: GO SUB 9880: FX "lineStyle", 2, #808080, 100: FX "moveTo", 190, 56: FX "lineTo", 234, 56: FX "lineTo", 234, 74: FX "lineTo", 190, 74: FX "lineTo", 190, 56: LET fc=#D80000: LET kx=0
11255 LET ky=16: LET kw=24: LET kh=56: GO SUB 9880: RETURN
11300 LET wy=10: GO SUB 9820: FX "lineStyle", 3, #000000, 100: FOR i=1 TO 7: FX "moveTo", 140+i*12, 0: FX "lineTo", 140+i*12, 79: NEXT i: FX "moveTo", 150, 24: FX "lineTo", 230, 24: FX "moveTo", 150, 56: FX "lineTo", 230, 56
11302 LET fc=#FFFFFF: LET sr=4: FOR i=1 TO 6: LET sx=i*22: LET sy=20+(i-INT (i/3)*3)*14: GO SUB 9860: NEXT i: RETURN
11350 LET wy=50: GO SUB 9820: FOR i=1 TO 4: LET fc=#D8A060: LET kx=i*48-6: LET ky=22: LET kw=32: LET kh=20: GO SUB 9880: FX "beginFill", #D80000, 100: FX "moveTo", kx-4, 22: FX "lineTo", kx+16, 8: FX "lineTo", kx+36, 22: FX "endFill"
11352 FX "lineStyle", 2, #602000, 100: FX "moveTo", kx+4, 42: FX "lineTo", kx+4, 66: FX "moveTo", kx+28, 42: FX "lineTo", kx+28, 66: NEXT i: FX "moveTo", 0, 46: FX "lineTo", 255, 46: RETURN
11400 LET px=200: LET py=6: LET pw=42: GO SUB 9800: LET hy=38: GO SUB 9850: LET wy=52: GO SUB 9820: FX "lineStyle", 1, #00A000, 100: FOR i=1 TO 8: FX "moveTo", i*8, 79: FX "lineTo", i*8+2, 50: NEXT i
11402 LET fc=#D8D800: LET sx=40: LET sy=14: LET sr=8: GO SUB 9860: RETURN
11450 LET fc=#A0A0A0: GO SUB 9840: LET px=190: LET py=8: LET pw=55: GO SUB 9800: LET fc=#202020: LET kx=0: LET ky=50: LET kw=255: LET kh=29: GO SUB 9880
11452 FX "lineStyle", 2, #000000, 100: FOR i=1 TO 4: FX "moveTo", i*50-20, 72: FX "lineTo", i*50-20, 30: FX "moveTo", i*50-20, 45: FX "lineTo", i*50-8, 34: FX "moveTo", i*50-20, 38: FX "lineTo", i*50-32, 26: NEXT i: RETURN
11500 LET px=128: LET py=4: LET pw=85: GO SUB 9800: FX "beginFill", #909090, 100: FX "moveTo", 20, 72: FX "lineTo", 20, 40: FX "lineTo", 40, 45: FX "lineTo", 45, 28: FX "lineTo", 60, 55: FX "lineTo", 70, 72: FX "endFill"
11502 FX "beginFill", #909090, 100: FX "moveTo", 180, 72: FX "lineTo", 185, 36: FX "lineTo", 200, 44: FX "lineTo", 210, 24: FX "lineTo", 225, 50: FX "lineTo", 240, 72: FX "endFill": FX "lineStyle", 2, #606060, 100: FX "moveTo", 100, 72
11503 FX "curveTo", 120, 40, 150, 60: GO SUB 9870: RETURN
11550 LET fc=#505050: GO SUB 9840: FX "beginFill", #000000, 100: FX "moveTo", 70, 79: FX "lineTo", 70, 40: FX "curveTo", 128, -10, 186, 40: FX "lineTo", 186, 79: FX "endFill": LET fc=#808080: LET sr=9: FOR i=1 TO 5: LET sx=70+i*20
11551 LET sy=68+(i-INT (i/2)*2)*6: GO SUB 9860: NEXT i
11552 FX "lineStyle", 2, #FFFFFF, 100: FOR i=1 TO 3: FX "moveTo", 90+i*20, 60: FX "curveTo", 80+i*20, 40, 100+i*20, 20: NEXT i: RETURN
11600 LET fc=#909090: GO SUB 9840: IF dst(14)=2 THEN FX "beginFill", #000000, 100: FX "moveTo", 110, 30: FX "lineTo", 150, 25: FX "lineTo", 160, 72: FX "lineTo", 100, 72: FX "endFill"
11602 IF dst(14)<2 THEN FX "lineStyle", 1, #606060, 100: FX "moveTo", 100, 30: FX "lineTo", 160, 28: FX "lineTo", 150, 72
11604 FX "lineStyle", 1, #606060, 100: FX "moveTo", 0, 20: FX "lineTo", 255, 18: FX "moveTo", 0, 50: FX "lineTo", 90, 52: FX "moveTo", 170, 52: FX "lineTo", 255, 50: RETURN
11650 LET fc=#100000: GO SUB 9840: FX "beginFill", #FF8000, 35: FX "moveTo", 200, 60: FOR i=1 TO 12: FX "lineTo", 120+80*COS (i*0.5236), 60+60*SIN (i*0.5236): NEXT i: FX "endFill"
11652 FX "beginFill", #FFD800, 100: FX "moveTo", 10, 79: FX "curveTo", 120, 8, 246, 79: FX "lineTo", 10, 79: FX "endFill": LET fc=#FFFFFF: LET sr=2: FOR i=1 TO 6: LET sx=40+i*30: LET sy=50+(i-INT (i/2)*2)*12: GO SUB 9860: NEXT i: RETURN
11700 LET fc=#606060: GO SUB 9840: FX "beginFill", #000000, 100: FX "moveTo", 90, 79: FX "lineTo", 90, 36: FX "curveTo", 128, 10, 166, 36: FX "lineTo", 166, 79: FX "endFill"
11702 LET fc=#D80000: LET sx=50: LET sy=30: LET sr=10: GO SUB 9860: LET fc=#000000: LET sr=3: LET sx=46: LET sy=28: GO SUB 9860: LET sx=55: GO SUB 9860: FX "lineStyle", 2, #D80000, 100: FX "moveTo", 200, 20: FX "lineTo", 230, 50
11703 FX "moveTo", 230, 20: FX "lineTo", 200, 50: RETURN
11750 LET fc=#00A000: LET kx=0: LET ky=50: LET kw=255: LET kh=29: GO SUB 9880: FX "lineStyle", 1, #000000, 100: FX "moveTo", 30, 79: FX "lineTo", 100, 50: FX "moveTo", 230, 79: FX "lineTo", 160, 50
11752 LET fc=#707070: LET sr=8: FOR i=1 TO 4: LET sx=40+i*40: LET sy=62+(i-INT (i/2)*2)*8: GO SUB 9860: NEXT i: LET ty=50: LET tz=30: LET tx=30: GO SUB 9810: LET tx=225: GO SUB 9810: RETURN
20001 DATA "in a snug round burrow dug into hollow hill","3102"
20002 DATA "on bleak open moorland, with grey hills rising ahead","4101300310035004"
20003 DATA "in a clearing stamped flat by heavy feet","800270061004"
20004 DATA "on a hidden track marked by huge footprints","20031205"
20005 DATA "in the ogres damp and smelly cave","2204"
20006 DATA "in elmhaven, a hidden valley of singing streams","40033007"
20007 DATA "on a hard high trail through the grey peaks","4006300810432010"
20008 DATA "on a narrow ledge above a sheer drop into a dim valley","400730101009"
20009 DATA "in a dry roomy cave that looks safe enough","2008"
20010 DATA "on a thin perilous path along the mountainside","400830211007"
20011 DATA "in the goblins lockup, a cell of damp stone","14134312"
20012 DATA "in a twisting dark passage","131180137015"
20013 DATA "in a huge cavern lit by smoky torches","501200147044"
20014 DATA "in a cramped airless tunnel","901310154016"
20015 DATA "in a cramped airless tunnel","2014701630179013"
20016 DATA "in a cramped airless tunnel","30174014"
20017 DATA "in a cramped airless tunnel","10186015"
20018 DATA "in a cramped airless tunnel","0014701720178019"
20019 DATA "on the shore of a cold black underground lake","1020"
20020 DATA "in a cramped airless tunnel","2019501880144016"
20021 DATA "in the timber hall of ursk the skin-changer","401050251022202660238024"
20022 DATA "on the bank of the wide river","2021502330258024"
20023 DATA "high on bare mountain slopes","802230437024"
20024 DATA "at the foaming forest river","102330254022"
20025 DATA "at the gloomy gate of the murkwold","402120278026"
20026 DATA "on the forest road","10213027"
20027 DATA "deeper along the forest road","402630281025"
20028 DATA "in the thick of the murkwold","40273029"
20029 DATA "beside a roaring waterfall","40282030"
20030 DATA "on the near bank of the black river","10293A31"
20031 DATA "on the far bank of the black river","4A303032"
20032 DATA "in a part of the wood where the trees whisper","40315633"
20033 DATA "in a glade festooned with grey silk","80325734"
20034 DATA "in a dark hollow strung with webs","80331835"
20035 DATA "in a ring of white stones. a door of pale wood is set in the hillside","203430361D39"
20036 DATA "on a dim path through the trees","40353037"
20037 DATA "on a dim path where the ground grows soft","40363038"
20038 DATA "in a reeking bog","40373046"
20039 DATA "in the woodkings high halls","2D3530415540"
20040 DATA "in a lightless cell beneath the woodkings halls","85414539"
20041 DATA "in the woodkings cellar. a hatch is set in the floor","554040390C42"
20042 DATA "in a foaming underground river that races towards an iron grating",""
20043 DATA "at a treeless gap high in the grey peaks","200740443023"
20044 DATA "outside the goblin gate, a dark arch in the rock","30434013"
20045 DATA "in reedmere town, built on stilts over the water","2046"
20046 DATA "on the shore of reedmere, the long lake","104540383B47"
20047 DATA "in a burnt and blasted land","40463048"
20048 DATA "among the ruins of kelder town","404710495050"
20049 DATA "at the great gate of the ashen crag","20481F51"
20050 DATA "below a grey wall of smooth stone under the crag","80483E51"
20051 DATA "in the lower halls under the crag","4E500052"
20052 DATA "in a smooth sloping passage","90510053"
20053 DATA "in the dragons den, heaped with gold","9052"
20100 DATA "chart","a faded chart",0,0,"chest","a heavy oak chest",1,1,"key","a big iron key",0,0,"blade","a short bright blade",5,0
20110 DATA "rope","a coil of rope",5,0,"straw","some mouldy straw",11,0,"band","a dull copper band",17,0,"bread","a loaf of honey bread",0,0
20120 DATA "curtain","a thick wool curtain",21,1,"barrel","an empty wine barrel",41,1,"wine","a jug of strong wine",41,0,"hoard","a sack of the dragons gold",53,0
20130 DATA "boat","a small flat boat",31,1,"lunch","a packed lunch",0,0,"sand","a heap of dry sand",11,1,"bones","a pile of gnawed bones",5,1
20140 DATA "hatch","an iron hatch in the floor",41,1,"window","a high barred window",11,1
20200 DATA "north","south","east","west","northeast","northwest","southeast","southwest","up","down"
20210 DATA "round oak door","massive stone door","high barred window","iron goblin door","red cellar door","web","web","web","web","river","hidden way","iron hatch","pale wooden door","hidden crag door","choked great gate"
20300 DATA 1,2,3,35,4,5,6,7,4,7,8,9,10,9,9,9,9,9,11,9,12,13,14,13,15,16,16,17,18,19,19,17,20,20,21,16,22,22,23,24,25,26,6,34,27,28,29,30,31,32,9,9,33` },
  { name: 'Hello 1982', src: `5 REM touch: enter=PRESS
10 REM Hello from 1982
20 BORDER 1: PAPER 0: INK 7: CLS
30 PRINT "HELLO WORLD"; TAB 16; "from Flash"
40 FOR i=1 TO 7
50 PRINT INK i; BRIGHT 1; "Colour "; i; TAB 16; "squared is "; i*i
60 NEXT i
70 PLOT 0,0: DRAW 255,175
80 CIRCLE INK 6; 128,88,40
90 LET a$="ZX Spectrum": PRINT AT 20,0; a$(4 TO 11); " says "; CHR$ 127; " 1982"
100 BEEP 0.1,0: BEEP 0.1,4: BEEP 0.2,7
110 PRINT AT 21,0; "press a key"; : PAUSE 0
120 GO TO 20` },
  { name: '10 PRINT maze', src: `5 REM touch:
10 BORDER 0: PAPER 0: BRIGHT 1: CLS
20 PRINT INK 1+INT (RND*6); CHR$ (47+45*INT (RND*2));
30 GO TO 20` },
  { name: 'Bouncing ball', src: `5 REM touch:
10 BORDER 0: PAPER 0: INK 5: CLS
20 LET x=40: LET y=90: LET dx=3: LET dy=2: LET r=10
30 REPEAT
40 CLS
50 CIRCLE INK 6; x,y,r
60 RECT INK 2; 0,0,256,4
70 PRINT AT 0,0; INK 7; "x="; INT x; " y="; INT y; TAB 20; "t="; TICKS
80 LET x=x+dx: LET y=y+dy
90 IF x<r OR x>255-r THEN LET dx=-dx: BEEP 0.02,20
100 IF y<r+4 OR y>175-r THEN LET dy=-dy: BEEP 0.02,8
110 PAUSE 1
120 UNTIL 0` },
  { name: 'Sierpinski chaos game', src: `5 REM touch:
10 REM The chaos game draws a Sierpinski triangle one dot at a time
20 BORDER 0: PAPER 0: INK 4: CLS
30 DIM x(3): DIM y(3)
40 LET x(1)=0: LET y(1)=0: LET x(2)=255: LET y(2)=0: LET x(3)=128: LET y(3)=175
50 LET px=128: LET py=60
60 FOR i=1 TO 20000
70 LET k=1+INT (RND*3)
80 LET px=(px+x(k))/2: LET py=(py+y(k))/2
90 PLOT INK 1+k; px,py
100 NEXT i
110 PRINT AT 0,0; INK 7; "done"` },
  { name: 'Tune (BEEP)', src: `5 REM touch: enter=PRESS
10 REM Twinkle twinkle, in BEEPs
20 BORDER 2: PAPER 0: INK 6: BRIGHT 1: CLS
30 LET n$="0 0 7 7 9 9 7 5 5 4 4 2 2 0"
40 LET p=1
50 LET s=p: REPEAT: LET p=p+1: UNTIL p>LEN n$ OR n$(p)=" "
60 LET note=VAL n$(s TO p-1)
70 PRINT INK 1+note-INT (note/6)*6; CHR$ (131+8*INT (note/4));
80 PLOT 10+s*8,20+note*10: DRAW 0,-20+note*2
90 BEEP 0.25,note
100 LET p=p+1
110 IF p<=LEN n$ THEN GO TO 50
120 PRINT: PRINT "again? (y/n)"
130 LET k$=INKEY$: IF k$="" THEN PAUSE 1: GO TO 130
140 IF k$="y" THEN GO TO 20` },
  { name: 'INPUT and strings', src: `5 REM touch: y n enter
10 BORDER 7: PAPER 7: INK 0: CLS
20 PRINT "What is your name?"
30 INPUT "Name: "; n$
40 IF n$="" THEN LET n$="Nobody"
50 PRINT "Hello, "; n$; "!"
60 PRINT "Backwards that is ";
70 FOR i=LEN n$ TO 1 STEP -1: PRINT n$(i);: NEXT i
80 PRINT
90 INPUT "How old are you? "; a
100 PRINT "In 1982 you were "; a-44; "."
110 IF a-44<0 THEN PRINT "So you were not born yet. Lucky you."
120 PRINT: PRINT INK 2; "Run again? (y/n)"
125 IF INKEY$<>"" THEN PAUSE 1: GO TO 125
130 LET k$=INKEY$: IF k$="" THEN PAUSE 1: GO TO 130
140 IF k$="y" OR k$="Y" THEN GO TO 10` },
  { name: 'Paint with the mouse', src: `5 REM touch:
10 BORDER 0: PAPER 0: INK 7: CLS
20 PRINT AT 0,0; "move the mouse over the screen"
30 LET c=1
40 REPEAT
50 LET x=MOUSEX: LET y=MOUSEY
60 IF x>=0 AND x<256 AND y>=0 AND y<176 THEN PLOT INK c; x,y
70 LET c=1+INT (TICKS/25)-INT (INT (TICKS/25)/7)*7
80 PRINT AT 21,0; INK c; "ink "; c; " at "; x; ","; y; "   "
90 PAUSE 1
100 UNTIL 0` },
  { name: 'Demo: bars and scroller', src: `5 REM touch:
10 REM colour bars, a sine scroller and a flashing border
20 PAPER 0: INK 7: BRIGHT 1: CLS
30 LET m$="      ZX FLASH ... SPECTRUM BASIC COMPILED TO AVM1 BYTECODE, RUNNING IN RUFFLE ... HELLO TO ALL 8-BIT FRIENDS      "
40 FOR b=0 TO 6: RECT INK 1+b; 0,10+b*8,256,8: NEXT b
50 DIM p(32): LET t=0
60 REPEAT
70 FOR i=1 TO 32
80 LET k=1+(t+i)-INT ((t+i)/LEN m$)*LEN m$
90 LET r=5+INT (3*SIN ((t+i)/4))
100 IF p(i)<>r THEN PRINT AT p(i),i-1;" "
110 PRINT AT r,i-1; INK 2+i-INT (i/6)*6; m$(k)
120 LET p(i)=r
130 NEXT i
140 BORDER 1+t-INT (t/7)*7
150 PRINT AT 0,0; INK 6; "frame "; t
160 LET t=t+1
170 PAUSE 2
180 UNTIL 0` },
];
