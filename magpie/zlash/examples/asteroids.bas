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
470 PRINT AT 21,0; INK 1; BRIGHT 1; "a d turn  w go  or click/touch"
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
