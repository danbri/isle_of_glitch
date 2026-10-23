10 REM ZX FLASH LOADER - pick a program with a key or a tap. Any program can come back here with LOADER, or open another with LOADER "name"
20 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
30 LET n=15: DIM i$(n,22): DIM n$(n,17): DIM t$(n,9): DIM c$(n,1): DIM r(n)
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
907 DATA "vector-trader","VECTOR TRADER","SPACE",7,"3"
910 DATA "tvp","TVP","TV",8,"4"
920 DATA "emo-asteroids","EMO ASTEROIDS","EMOJI",9,"5"
930 DATA "miner-ned","MINER NED","PLATFORM",10,"6"
940 DATA "pipkins-quest","PIPKIN'S QUEST","ADVENTURE",11,"7"
950 DATA "hello-1982","HELLO 1982","",13,"8","10-print-maze","10 PRINT MAZE","",14,"9"
960 DATA "bouncing-ball","BOUNCING BALL","",15,"a","sierpinski-chaos-game","SIERPINSKI","",16,"b"
970 DATA "tune-beep","TUNE (BEEP)","",17,"c","input-and-strings","INPUT AND STRINGS","",18,"d"
980 DATA "paint-with-the-mouse","PAINT WITH MOUSE","",19,"e","demo-bars-and-scroller","BARS AND SCROLLER","",20,"f"
990 DATA 2,6,4,5
