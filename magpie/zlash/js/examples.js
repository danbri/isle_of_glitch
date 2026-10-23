export const EXAMPLES = [
  { id: 'loader', name: 'Loader', src: `10 REM ZX FLASH LOADER - pick a program with a key or a tap. Any program can come back here with LOADER, or open another with LOADER "name"
20 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
30 LET n=14: DIM i$(n,22): DIM n$(n,17): DIM t$(n,9): DIM c$(n,1): DIM r(n)
40 RESTORE 900: FOR i=1 TO n: READ i$(i),n$(i),t$(i),r(i),c$(i): NEXT i
50 REM loading stripes, as a tape would: pilot tone, then data. Any key or tap skips them
60 FOR i=1 TO 30: BORDER 2+3*(i-INT (i/2)*2): PAUSE 1: IF INKEY$<>"" OR MOUSEB<>0 THEN GO TO 100
70 NEXT i
80 FOR i=1 TO 40: BORDER 1+5*INT (RND*2): PAUSE 1: IF INKEY$<>"" OR MOUSEB<>0 THEN GO TO 100
90 NEXT i
100 BORDER 0: CLS
110 PRINT AT 1,1; INK 7; "ZX FLASH"
120 PRINT AT 2,1; INK 5; "PROGRAM LOADER"
130 RESTORE 990: FOR s=0 TO 3: READ c: FOR k=0 TO 19: RECT INK c; 196+s*8+k,148+k,8,1: NEXT k: NEXT s
140 PRINT AT 4,1; INK 6; "FEATURED": PRINT AT 12,1; INK 6; "MORE PROGRAMS"
150 LET p=0: FOR i=1 TO n: GO SUB 500: NEXT i
160 PRINT AT 21,1; INK 5; "PRESS A KEY OR TAP A PROGRAM"
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
900 DATA "monster-maze","3D MONSTER MAZE","ZX81 1981",5,"1"
905 DATA "pop-party","POP PARTY","EMOJI",6,"2"
910 DATA "tvp","TVP","TV",7,"3"
920 DATA "emo-asteroids","EMO ASTEROIDS","EMOJI",8,"4"
930 DATA "jump","JUMP DEMO","PLATFORM",9,"5"
940 DATA "pipkins-quest","PIPKIN'S QUEST","ADVENTURE",10,"6"
950 DATA "hello-1982","HELLO 1982","",13,"7","10-print-maze","10 PRINT MAZE","",14,"8"
960 DATA "bouncing-ball","BOUNCING BALL","",15,"9","sierpinski-chaos-game","SIERPINSKI","",16,"a"
970 DATA "tune-beep","TUNE (BEEP)","",17,"b","input-and-strings","INPUT AND STRINGS","",18,"c"
980 DATA "paint-with-the-mouse","PAINT WITH MOUSE","",19,"d","demo-bars-and-scroller","BARS AND SCROLLER","",20,"e"
990 DATA 2,6,4,5
` },
  { id: 'monster-maze', name: '3D Monster Maze', src: `10 REM 3D MONSTER MAZE - after Malcolm Evans' 1981 ZX81 original. Rex's sprites and the view geometry follow the original code.
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
  { id: 'pop-party', name: 'Pop Party (emoji, Flash-style)', src: `10 REM ======================== POP PARTY ========================
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
  { name: 'TVP', src: `10 REM TVP
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
  { id: 'emo-asteroids', name: 'Emo Asteroids (emoji bitmaps)', src: `10 REM EMO ASTEROIDS - a cosy drift through a wraparound sky. Nothing here can hurt you.
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
  { id: 'jump', name: 'Jump demo (platform game)', src: `10 REM JUMP DEMO - a one-screen platform game built on SPRITE
20 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
30 SPRITE "hero1","..WWWW..",".WWWWWW.",".W2WW2W.",".WWWWWW.","..WWWW..","...55...","..5555..",".55..55.",".5....5.","..6..6..","..6..6..",".66..66."
40 SPRITE "hero2","..WWWW..",".WWWWWW.",".W2WW2W.",".WWWWWW.","..WWWW..","...55...","..5555..",".55..55.",".5....5.","..6..6..",".6....6.","66....66"
50 SPRITE "guard","..2222..",".222222.","2.2222.2","22.22.22","22222222",".2.22.2.","..2222..",".2....2.","22....22","2......2"
60 SPRITE "key","..66..",".6..6.","..66..","..6...","..66..","..6...","..66.."
70 SPRITE "plat","44444444444444444444444444444444","44444444444444444444444444444444","4.4.4.4.4.4.4.4.4.4.4.4.4.4.4.4."
80 DIM px(8): DIM py(8): DIM pw(8): DIM kx(5): DIM ky(5): DIM kg(5)
90 RESTORE 100: FOR i=1 TO 8: READ px(i),py(i),pw(i): NEXT i: FOR i=1 TO 5: READ kx(i),ky(i): LET kg(i)=0: NEXT i
100 DATA 0,164,256,0,128,96,160,128,96,32,96,64,128,96,96,0,64,80,176,64,80,96,32,64
110 DATA 12,112,230,112,120,80,20,48,200,48
120 LET hx=8: LET hy=152: LET vx=0: LET vy=0: LET onp=1: LET gx=100: LET gd=1: LET got=0: LET t=0: LET lives=3
130 REM --- draw the static scene once; sprites are repositioned every frame ---
140 CLS: FOR i=1 TO 8: FOR j=0 TO INT (pw(i)/32)-1: SPRITE "plat", px(i)+j*32, py(i), 100, 100: NEXT j: NEXT i
150 PRINT AT 0,0; INK 6; "JUMP DEMO"; TAB 20; "LIVES "; lives
160 REPEAT
170 LET k$=INKEY$: LET t=t+1
175 IF k$=CHR$ 8 OR k$="a" OR k$="o" THEN LET vx=-2.5
176 IF k$=CHR$ 9 OR k$="d" OR k$="p" THEN LET vx=2.5
177 IF k$="" AND onp=1 THEN LET vx=vx*0.6: IF ABS vx<0.3 THEN LET vx=0
178 IF k$="l" OR k$="L" THEN LOADER
180 LET hx=hx+vx: IF hx<0 THEN LET hx=0: LET vx=0
190 IF hx>248 THEN LET hx=248: LET vx=0
200 IF (k$=CHR$ 11 OR k$="w" OR k$="q" OR k$=" ") AND onp=1 THEN LET vy=-6.6: LET onp=0: BEEP 0.02,12
210 LET vy=vy+0.4: IF vy>6 THEN LET vy=6
220 LET hy=hy+vy: LET onp=0
230 FOR i=1 TO 8: IF vy>=0 AND hx+6>px(i) AND hx+2<px(i)+pw(i) AND hy+12>=py(i) AND hy+12<=py(i)+6 THEN LET hy=py(i)-12: LET vy=0: LET onp=1
240 NEXT i
250 IF hy>170 THEN GO TO 500
260 LET gx=gx+gd*1.2: IF gx<96 OR gx>152 THEN LET gd=-gd
270 IF ABS (hx-gx)<7 AND ABS (hy-116)<10 THEN GO TO 500
280 FOR i=1 TO 5: IF kg(i)=0 AND ABS (hx+4-kx(i)-3)<8 AND ABS (hy+6-ky(i)-3)<10 THEN LET kg(i)=1: LET got=got+1: BEEP 0.05,20: BEEP 0.05,27
290 NEXT i
300 IF got=5 THEN GO TO 600
310 GO SUB 400
320 PAUSE 1
330 UNTIL 0
400 REM --- redraw the moving things ---
410 SPRITE CLEAR
420 FOR i=1 TO 8: FOR j=0 TO INT (pw(i)/32)-1: SPRITE "plat", px(i)+j*32, py(i), 100, 100: NEXT j: NEXT i
430 FOR i=1 TO 5: IF kg(i)=0 THEN SPRITE "key", kx(i), ky(i)+2*(INT (t/10)-INT (INT (t/10)/2)*2)
440 NEXT i
450 SPRITE "guard", gx, 118
460 IF onp=1 AND vx<>0 AND INT (t/4)-INT (INT (t/4)/2)*2=0 THEN SPRITE "hero2", hx, hy: RETURN
470 SPRITE "hero1", hx, hy
480 PRINT AT 21,0; INK 5; "KEYS "; got; "/5"; TAB 12; "A D run  W jump  L loader"
490 RETURN
500 REM --- lost a life ---
510 FOR i=1 TO 4: BEEP 0.05,-10-i*2: NEXT i
520 LET lives=lives-1: IF lives=0 THEN PRINT AT 10,10; INK 2; PAPER 7; " GAME OVER ": PAUSE 100: GO TO 20
530 LET hx=8: LET hy=152: LET vx=0: LET vy=0: PRINT AT 0,0; INK 6; "JUMP DEMO"; TAB 20; "LIVES "; lives; " ": GO TO 160
600 REM --- won ---
610 PRINT AT 10,8; INK 4; PAPER 7; " ALL KEYS FOUND! "
620 FOR i=0 TO 24 STEP 2: BEEP 0.04,i: NEXT i
630 PRINT AT 12,6; INK 7; "press a key to play again": PAUSE 0: GO TO 20
` },
  { id: 'pipkins-quest', name: "Pipkin's Quest (text adventure)", src: `10 REM PIPKIN'S QUEST - a text adventure with pictures, a homage to the 1982 Melbourne House adventure. All names and text here are original.
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
  { name: 'Hello 1982', src: `10 REM Hello from 1982
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
  { name: '10 PRINT maze', src: `10 BORDER 0: PAPER 0: BRIGHT 1: CLS
20 PRINT INK 1+INT (RND*6); CHR$ (47+45*INT (RND*2));
30 GO TO 20` },
  { name: 'Bouncing ball', src: `10 BORDER 0: PAPER 0: INK 5: CLS
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
  { name: 'Sierpinski chaos game', src: `10 REM The chaos game draws a Sierpinski triangle one dot at a time
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
  { name: 'Tune (BEEP)', src: `10 REM Twinkle twinkle, in BEEPs
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
  { name: 'INPUT and strings', src: `10 BORDER 7: PAPER 7: INK 0: CLS
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
130 LET k$=INKEY$: IF k$="" THEN PAUSE 1: GO TO 130
140 IF k$="y" OR k$="Y" THEN GO TO 10` },
  { name: 'Paint with the mouse', src: `10 BORDER 0: PAPER 0: INK 7: CLS
20 PRINT AT 0,0; "move the mouse over the screen"
30 LET c=1
40 REPEAT
50 LET x=MOUSEX: LET y=MOUSEY
60 IF x>=0 AND x<256 AND y>=0 AND y<176 THEN PLOT INK c; x,y
70 LET c=1+INT (TICKS/25)-INT (INT (TICKS/25)/7)*7
80 PRINT AT 21,0; INK c; "ink "; c; " at "; x; ","; y; "   "
90 PAUSE 1
100 UNTIL 0` },
  { name: 'Demo: bars and scroller', src: `10 REM colour bars, a sine scroller and a flashing border
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
