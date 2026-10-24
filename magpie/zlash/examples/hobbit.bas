5 REM touch: >n=N >s=S >e=E >w=W >u=UP >d=DOWN >look=LOOK >i=INV enter
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
20300 DATA 1,2,3,35,4,5,6,7,4,7,8,9,10,9,9,9,9,9,11,9,12,13,14,13,15,16,16,17,18,19,19,17,20,20,21,16,22,22,23,24,25,26,6,34,27,28,29,30,31,32,9,9,33