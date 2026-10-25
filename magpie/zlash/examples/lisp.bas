5 REM touch:
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
145 LET ec=0: LET sn=0: LET sf=0: LET sg=0: LET ra=0: LET q$="|/-\": EMOJI "⏲️","timer",32
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
