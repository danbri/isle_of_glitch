10 REM 3D MONSTER MAZE - after Malcolm Evans' 1981 ZX81 original. Rex's sprites and the view geometry follow the original code.
20 BORDER 15: PAPER 7: INK 0: BRIGHT 1: CLS
30 DIM m(17,15): DIM dr(3): DIM dc(3): DIM cs(7): DIM hh(7): DIM sn$(11,3): DIM sr(11): DIM sc(11)
40 RESTORE 50: FOR i=0 TO 3: READ dr(i),dc(i): NEXT i: FOR i=0 TO 7: READ cs(i),hh(i): NEXT i
50 DATA -1,0,0,1,1,0,0,-1,0,12,1,11,5,7,8,4,10,2,11,1,12,1,13,1
60 RESTORE 2990: FOR i=1 TO 11: READ sn$(i),sr(i),sc(i): NEXT i
70 IF rt0=0 THEN LET rt0=16: LET won=0
80 REM --- the ringmaster ---
90 PRINT AT 1,8; "3D MONSTER MAZE"
100 PRINT AT 3,2; "ROLL UP, ROLL UP. WELCOME TO": PRINT "  THE CIRCUS OF THE DARK MAZE."
110 PRINT '"  SEE THE AMAZING TYRANNOSAURUS": PRINT "  REX, KING OF THE DINOSAURS,": PRINT "  IN HIS LAIR. FIND THE EXIT": PRINT "  BEFORE HE FINDS YOU."
120 PRINT '"  A D TURN (O P, 5 8, CURSORS)": PRINT "  W WALKS FORWARD (Q, 7, UP)": PRINT "  S TURNS ROUND"
130 IF won>0 THEN PRINT AT 2,3; "ESCAPES: "; won; "  REX IS QUICKER"
140 SPRITE "d2l", 170, 95, 200, 183
150 PRINT AT 21,5; "PRESS ANY KEY TO ENTER": PAUSE 0
160 CLS: PRINT AT 10,7; "BUILDING THE MAZE..."
170 REM --- maze: random passageways from the south-east corner, as the original does ---
180 FOR i=0 TO 17: FOR j=0 TO 15: LET m(i,j)=1: NEXT j: NEXT i
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
310 REM the exit: a passage in the north half, sealed so it can be reached from one side only
320 LET ex=1+INT (RND*7): LET ey=1+INT (RND*15): IF m(ex,ey)<>0 THEN GO TO 320
330 LET m(ex,ey)=2: LET n=0
340 FOR k=0 TO 3: IF m(ex+dr(k),ey+dc(k))=0 THEN LET n=n+1: IF n>1 THEN LET m(ex+dr(k),ey+dc(k))=1
350 NEXT k
360 LET pr=16: LET pc=15: LET f=0: LET st=0: LET seen=0: LET stuck=0: LET rs=0: LET mv=1: LET lm=0
370 LET rr=1: LET rc=5
375 IF m(rr,rc)<>0 THEN LET rc=rc+1: IF rc>10 THEN LET rc=5: LET rr=rr+1
380 IF m(rr,rc)<>0 THEN GO TO 375
390 LET nt=TICKS+rt0*2
400 REM --- main loop ---
410 REPEAT
420 LET k$=INKEY$
430 IF k$=CHR$ 8 OR k$="a" OR k$="o" OR k$="5" THEN LET f=(f+3)-INT ((f+3)/4)*4: LET mv=1
440 IF k$=CHR$ 9 OR k$="d" OR k$="p" OR k$="8" THEN LET f=(f+1)-INT ((f+1)/4)*4: LET mv=1
450 IF k$=CHR$ 10 OR k$="s" THEN LET f=(f+2)-INT ((f+2)/4)*4: LET mv=1
460 IF k$=CHR$ 11 OR k$="w" OR k$="q" OR k$="7" THEN IF m(pr+dr(f),pc+dc(f))<>1 THEN LET pr=pr+dr(f): LET pc=pc+dc(f): LET st=st+1: LET mv=1: LET lm=TICKS
470 IF m(pr,pc)=2 THEN GO TO 700
480 IF TICKS>nt THEN GO SUB 900: LET nt=TICKS+rt0*(1+(TICKS-lm>60)): IF mv=0 THEN GO SUB 1200
490 IF rr=pr AND rc=pc THEN GO TO 800
500 IF mv=1 THEN GO SUB 1000: LET mv=0: PAUSE 3
510 PAUSE 1
520 UNTIL 0
700 REM --- escaped ---
710 LET won=won+1: LET rt0=rt0-3: IF rt0<8 THEN LET rt0=8
720 CLS: PRINT AT 8,8; "YOU HAVE ESCAPED": PRINT AT 10,9; "SCORE "; st
730 FOR i=0 TO 12 STEP 2: BEEP 0.08,i: NEXT i
740 PRINT AT 13,2; "THE RINGMASTER INSISTS ON": PRINT AT 14,2; "ANOTHER PERFORMANCE. REX IS": PRINT AT 15,2; "HUNGRIER AND QUICKER NOW."
750 PRINT AT 21,5; "PRESS ANY KEY TO CONTINUE": PAUSE 0: GO TO 20
800 REM --- the kill: Rex's mouth, then the posthumous award ---
810 CLS: SPRITE "d0r", 40, 0, 400, 367
820 FOR i=1 TO 3: BEEP 0.15,-24: BEEP 0.1,-20: NEXT i: PAUSE 60
830 CLS: PRINT AT 5,3; "YOU HAVE BEEN POSTHUMOUSLY": PRINT AT 6,3; "AWARDED THE TITLE OF"
840 PRINT AT 8,10; "REX'S LUNCH"
850 PRINT AT 11,8; "SCORE "; st
860 PRINT AT 21,5; "PRESS ANY KEY TO TRY AGAIN": PAUSE 0: GO TO 20
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
1050 LET xa=32+cs(d)*8: LET xb=32+cs(d+1)*8: LET ta=(12-hh(d))*7.333: LET tb=(12-hh(d+1))*7.333: LET ba=(12+hh(d))*7.333: LET bb=(12+hh(d+1))*7.333
1060 LET lw=m(r+dr(lf),c+dc(lf)): LET rw=m(r+dr(rt2),c+dc(rt2))
1070 IF lw=1 THEN FX "beginFill", #000000, 100: FX "moveTo", xa, ta: FX "lineTo", xb, tb: FX "lineTo", xb, bb: FX "lineTo", xa, ba: FX "lineTo", xa, ta: FX "endFill"
1080 IF lw<>1 THEN FX "beginFill", #808080, 100: FX "moveTo", xa, tb: FX "lineTo", xb, tb: FX "lineTo", xb, bb: FX "lineTo", xa, bb: FX "lineTo", xa, tb: FX "endFill"
1090 IF rw=1 THEN FX "beginFill", #000000, 100: FX "moveTo", 256-xa, ta: FX "lineTo", 256-xb, tb: FX "lineTo", 256-xb, bb: FX "lineTo", 256-xa, ba: FX "lineTo", 256-xa, ta: FX "endFill"
1100 IF rw<>1 THEN FX "beginFill", #808080, 100: FX "moveTo", 256-xb, tb: FX "lineTo", 256-xa, tb: FX "lineTo", 256-xa, bb: FX "lineTo", 256-xb, bb: FX "lineTo", 256-xb, tb: FX "endFill"
1110 LET fw=m(r+dr(f),c+dc(f))
1120 IF fw=1 THEN FX "beginFill", #808080, 100: FX "moveTo", xb, tb: FX "lineTo", 256-xb, tb: FX "lineTo", 256-xb, bb: FX "lineTo", xb, bb: FX "lineTo", xb, tb: FX "endFill": LET far=d: LET d=5
1130 IF fw=2 THEN GO SUB 1300: LET far=d: LET d=5
1140 NEXT d
1150 IF far=6 THEN FX "beginFill", #000000, 100: FX "moveTo", 128, tb: FX "lineTo", 128, bb: FX "lineTo", 128, tb: FX "endFill"
1160 GO SUB 1200
1170 RETURN
1200 REM --- Rex and the status line (redrawn without touching the view) ---
1210 SPRITE CLEAR: LET seen=0: LET los=0
1220 IF rr=pr OR rc=pc THEN LET los=1: LET tr=rr: LET tc=rc: REPEAT: LET tr=tr+SGN (pr-tr): LET tc=tc+SGN (pc-tc): IF m(tr,tc)=1 THEN LET los=0
1230 IF rr=pr OR rc=pc THEN UNTIL los=0 OR (tr=pr AND tc=pc)
1240 LET di=ABS (pr-rr)+ABS (pc-rc)
1250 LET ah=(rr-pr)*dr(f)+(rc-pc)*dc(f): LET sd=(rr-pr)*dc(f)-(rc-pc)*dr(f)
1260 IF los=1 AND ah>0 AND ah<=5 AND sd=0 AND ah<=far THEN LET seen=1: LET i=(ah-1)*2+rs+1: SPRITE sn$(i), 32+sc(i)*8, sr(i)*7.333, 400, 367
1270 LET m$="HE IS HUNTING FOR YOU"
1280 IF di>=7 AND di<=8 THEN LET m$="FOOTSTEPS APPROACHING"
1290 IF di<=6 AND di>=3 AND los=1 THEN LET m$="REX HAS SEEN YOU"
1292 IF di<3 AND los=1 AND ah<0 THEN LET m$="RUN HE IS BEHIND YOU"
1294 IF di<3 AND los=1 AND sd<>0 AND ah=0 THEN LET m$="RUN HE IS BESIDE YOU"
1296 IF seen=0 AND stuck=1 THEN LET m$="REX LIES IN WAIT"
1298 PRINT AT 21,0; "                                ": PRINT AT 21,1; m$: PRINT AT 1,26; "SCORE": PRINT AT 2,26; st; " ": RETURN
1300 REM --- the exit pattern: concentric squares in the facing-wall slot ---
1310 LET q=0: FOR e=0 TO 5
1320 FX "beginFill", q*#ffffff, 100: FX "moveTo", xb+e*(128-xb)/6, tb+e*(88-tb)/6: FX "lineTo", 256-xb-e*(128-xb)/6, tb+e*(88-tb)/6: FX "lineTo", 256-xb-e*(128-xb)/6, bb-e*(bb-88)/6: FX "lineTo", xb+e*(128-xb)/6, bb-e*(bb-88)/6: FX "endFill"
1330 LET q=1-q: NEXT e
1340 RETURN
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
