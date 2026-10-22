10 REM EMOJI FIESTA - the browser rasterises emoji at compile time, the compiler bakes them into Flash bitmaps, BASIC throws them about
20 EMOJI "🙂","a",64: EMOJI "🚀","b",64: EMOJI "🍕","c",64: EMOJI "👾","d",64: EMOJI "🌈","e",64: EMOJI "🎸","f",64: EMOJI "🦖","g",64: EMOJI "💾","h",64
30 BORDER 0: PAPER 0: INK 7: BRIGHT 1: CLS
40 LET n=16: DIM x(n): DIM y(n): DIM vx(n): DIM vy(n): DIM r(n): DIM vr(n): DIM s(n): DIM i$(n)
50 FOR i=1 TO n: LET x(i)=20+RND*216: LET y(i)=RND*100: LET vx(i)=RND*4-2: LET vy(i)=0: LET r(i)=RND*360: LET vr(i)=RND*8-4: LET s(i)=30+RND*45: LET i$(i)=CHR$ (97+INT (RND*8)): NEXT i
60 LET t=0: LET mode=0
70 REPEAT
80 SPRITE CLEAR: LET t=t+1
90 IF INKEY$=" " THEN LET mode=1-mode: PAUSE 10
100 FOR i=1 TO n
110 LET w=32*s(i)/100
120 LET vy(i)=vy(i)+0.25: LET x(i)=x(i)+vx(i): LET y(i)=y(i)+vy(i): LET r(i)=r(i)+vr(i)
130 IF y(i)>176-w THEN LET y(i)=176-w: LET vy(i)=-vy(i)*0.85: LET vr(i)=vx(i)*3: IF ABS vy(i)>2 THEN BEEP 0.01,INT (RND*24)
140 IF y(i)<w THEN LET y(i)=w: LET vy(i)=ABS vy(i)
150 IF x(i)<w OR x(i)>256-w THEN LET vx(i)=-vx(i)*0.9: LET x(i)=x(i)+vx(i)*2
160 REM the mouse is a magnet; press space to make it a repeller
170 LET dx=MOUSEX-x(i): LET dy=(175-MOUSEY)-y(i): LET d=SQR (dx*dx+dy*dy)+12: LET g=0.7-1.4*mode: LET vx(i)=vx(i)+dx/d*g: LET vy(i)=vy(i)+dy/d*g
180 LET vx(i)=vx(i)*0.995: LET vy(i)=vy(i)*0.995
190 SPRITE i$(i), x(i), y(i), s(i), s(i), r(i), 65+35*SIN (t/9+i)
200 NEXT i
210 PRINT AT 0,0; INK 6; "EMOJI FIESTA"; TAB 16; INK 5; "mouse: "; "magnet " AND mode=0; "repeller" AND mode=1
220 PRINT AT 21,0; INK 2; "space flips the field"; TAB 24; INK 7; t
230 PAUSE 1
240 UNTIL 0
