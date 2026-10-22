10 REM MANIC MINOR - a one-screen platform game built on SPRITE
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
120 LET hx=8: LET hy=152: LET vy=0: LET onp=1: LET gx=100: LET gd=1: LET got=0: LET t=0: LET lives=3
130 REM --- draw the static scene once; sprites are repositioned every frame ---
140 CLS: FOR i=1 TO 8: FOR j=0 TO INT (pw(i)/32)-1: SPRITE "plat", px(i)+j*32, py(i), 100, 100: NEXT j: NEXT i
150 PRINT AT 0,0; INK 6; "MANIC MINOR"; TAB 20; "LIVES "; lives
160 REPEAT
170 LET k$=INKEY$: LET t=t+1
180 IF k$=CHR$ 8 OR k$="a" OR k$="o" THEN LET hx=hx-2: IF hx<0 THEN LET hx=0
190 IF k$=CHR$ 9 OR k$="d" OR k$="p" THEN LET hx=hx+2: IF hx>248 THEN LET hx=248
200 IF (k$=CHR$ 11 OR k$="w" OR k$="q" OR k$=" ") AND onp=1 THEN LET vy=-5: LET onp=0: BEEP 0.02,12
210 LET vy=vy+0.4: IF vy>6 THEN LET vy=6
220 LET hy=hy+vy: LET onp=0
230 FOR i=1 TO 8: IF vy>=0 AND hx+6>px(i) AND hx+2<px(i)+pw(i) AND hy+12>=py(i) AND hy+12<=py(i)+6 THEN LET hy=py(i)-12: LET vy=0: LET onp=1
240 NEXT i
250 IF hy>170 THEN GO TO 500
260 LET gx=gx+gd*1.5: IF gx<96 OR gx>152 THEN LET gd=-gd
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
460 IF onp=1 AND k$<>"" AND INT (t/4)-INT (INT (t/4)/2)*2=0 THEN SPRITE "hero2", hx, hy: RETURN
470 SPRITE "hero1", hx, hy
480 PRINT AT 21,0; INK 5; "KEYS "; got; "/5"; TAB 12; "A D run  W jump"
490 RETURN
500 REM --- lost a life ---
510 FOR i=1 TO 4: BEEP 0.05,-10-i*2: NEXT i
520 LET lives=lives-1: IF lives=0 THEN PRINT AT 10,10; INK 2; PAPER 7; " GAME OVER ": PAUSE 100: GO TO 20
530 LET hx=8: LET hy=152: LET vy=0: PRINT AT 0,0; INK 6; "MANIC MINOR"; TAB 20; "LIVES "; lives; " ": GO TO 160
600 REM --- won ---
610 PRINT AT 10,8; INK 4; PAPER 7; " ALL KEYS FOUND! "
620 FOR i=0 TO 24 STEP 2: BEEP 0.04,i: NEXT i
630 PRINT AT 12,6; INK 7; "press a key to play again": PAUSE 0: GO TO 20
