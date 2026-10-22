10 REM PIPKIN'S QUEST - a text adventure, a homage to the 1982 Melbourne House adventure. All names and text here are original.
11 REM Who stands in for whom: pipkin = the burrow-dwelling hero; wendel = the wizard; durrock = the dwarf leader; aelric = lord of the hidden valley;
12 REM sliver = the creature of the underground lake; harl = the bowman of the lake town; ashwyrm = the dragon; ursk = the skin-changer;
13 REM the ogres = the trolls; the grey wolf = the warg; the woodfolk = the wood elves; hollow hill = the hero's home; elmhaven = the hidden valley;
14 REM the grey peaks = the misty mountains; the murkwold = the dark forest; reedmere = the long lake and its town; kelder = the ruined town; the ashen crag = the lonely mountain.
15 REM Commands: directions (n s e w ne nw se sw u d), look, take, drop, inventory, open, close, unlock, wait, kill, examine, wear, remove, break, throw, put, climb, cross, give, score, help, quit, and say to durrock "open window".
20 BORDER 7: PAPER 7: INK 0: CLS
21 WRAP 1
30 DIM n$(49): DIM e$(49): DIM o$(14): DIM on$(14): DIM ol(14): DIM of(14): DIM dn$(10): DIM dm$(5): DIM dst(12): DIM w$(4)
40 RESTORE 9000: FOR i=1 TO 49: READ n$(i),e$(i): NEXT i
50 FOR i=1 TO 14: READ o$(i),on$(i),ol(i),of(i): NEXT i
60 FOR i=1 TO 10: READ dn$(i): NEXT i
70 FOR i=1 TO 5: READ dm$(i): NEXT i
80 FOR i=1 TO 12: LET dst(i)=0: NEXT i: LET dst(1)=1
90 LET r=1: LET tn=0: LET ct=0: LET day=0: LET gl=1: LET th=1: LET co=0: LET wr=0: LET wg=1: LET bt=0: LET em=0: LET mv=0
95 LET kt=0: LET st=0: LET mr=0: LET gd=0: LET rt=0: LET ec=0: LET tt=0: LET won=0
100 LET vw$="n      1north  1s      2south  2e      3east   3w      4west   4ne     5northea5nw     6northwe6se     7southea7sw     8southwe8u      9up     9d      :down   :"
110 LET vw$=vw$+"go     ;run    ;look   <l      <take   =get    =t      =drop   >invento?i      ?inv    ?open   @close  Ashut   Aunlock Bsay    Ctalk   Cask    Cwait   Dz      Dkill   Eattack Efight  Estrike E"
120 LET vw$=vw$+"examineFx      Fread   Fhelp   Gquit   Hwear   Iremove Jbreak  Kcut    Kthrow  Lput    Minsert Mclimb  Njump   Nenter  Nride   Neat    Odrink  Pscore  Qcross  Rswim   Rgive   Soffer  Sthe    /a      /an     /to     /with   /at     /in     /into   /of     /me     /across /through/onto   /from   /out    /and    /on     /"
130 PRINT "PIPKIN'S QUEST"'"a small person, a long road,"'"and a dragon at the end of it."'"type HELP for a list of words."
140 GO SUB 2500
200 INPUT "> "; a$: PRINT: PRINT "> ";a$
210 GO SUB 1400: GO SUB 1500
220 IF nw=0 THEN PRINT " pardon ?": GO TO 200
230 LET t$=w$(1): GO SUB 1600
240 IF v=0 THEN PRINT " i do not understand "" ";w$(1);" """: GO TO 200
250 IF v=11 AND w$(2)<>"" THEN LET t$=w$(2): GO SUB 1600: IF v<=0 OR v>10 THEN LET v=11
260 IF v=12 AND w$(2)<>"" THEN LET v=22
270 IF v=13 AND w$(2)="off" THEN LET v=26: LET w$(2)=w$(3)
280 LET ob=0: FOR i=1 TO 14: IF o$(i)=w$(3) THEN LET ob=i
290 NEXT i: FOR i=1 TO 14: IF o$(i)=w$(2) THEN LET ob=i
300 NEXT i
310 IF v<=10 THEN LET d=v: GO SUB 2000: GO TO 900
320 GO TO 5000+v*100
900 GO SUB 4000: GO TO 200
1400 LET a$=a$+" ": FOR p=1 TO LEN a$: LET c=CODE (a$(p)): IF c>64 AND c<91 THEN LET a$=a$(1 TO p-1)+CHR$ (c+32)+a$(p+1 TO)
1410 IF c=34 OR c=44 OR c=46 OR c=39 OR c=63 THEN LET a$=a$(1 TO p-1)+" "+a$(p+1 TO)
1420 NEXT p: RETURN
1500 LET nw=0: LET s=0: FOR i=1 TO 4: LET w$(i)="": NEXT i
1510 FOR p=1 TO LEN a$: IF a$(p)<>" " AND s=0 THEN LET s=p
1520 IF a$(p)=" " AND s>0 THEN LET t$=a$(s TO p-1): LET s=0: GO SUB 1550
1530 NEXT p: RETURN
1550 LET u$=t$: GO SUB 1600: LET t$=u$: IF v<0 THEN RETURN
1560 IF t$="map" THEN LET t$="chart"
1565 IF t$="sword" THEN LET t$="blade"
1570 IF t$="ring" THEN LET t$="band"
1575 IF t$="treasure" OR t$="gold" OR t$="sack" THEN LET t$="hoard"
1580 IF t$="trapdoor" OR t$="trap" THEN LET t$="hatch"
1590 IF nw<4 THEN LET nw=nw+1: LET w$(nw)=t$
1595 RETURN
1600 LET v=0: LET t$=t$+"       ": LET t$=t$(1 TO 7)
1610 FOR k=1 TO LEN vw$ STEP 8: IF vw$(k TO k+6)=t$ THEN LET v=CODE (vw$(k+7))-48: LET k=LEN vw$
1620 NEXT k: RETURN
1950 LET dr=0: LET d=0: FOR j=1 TO LEN e$(r) STEP 4: LET q=CODE (e$(r)(j+1))-48: IF (q=1 OR q=2 OR q=4 OR q=5) AND dr=0 THEN LET dr=q: LET d=VAL (e$(r)(j)): IF d=0 THEN LET d=10
1960 NEXT j: RETURN
2000 LET dr=0: LET nx=0: FOR j=1 TO LEN e$(r) STEP 4: LET q=VAL (e$(r)(j)): IF q=0 THEN LET q=10
2010 IF q=d THEN LET nx=VAL (e$(r)(j+2 TO j+3)): LET dr=CODE (e$(r)(j+1))-48: IF dr>9 THEN LET dr=dr-7
2020 NEXT j
2030 IF nx=0 THEN PRINT " there is no way ";dn$(d);".": RETURN
2040 IF dr>0 AND dst(dr)<2 THEN GO SUB 2200: RETURN
2050 PRINT "you go ";dn$(d);".": IF dr=3 THEN PRINT "durrock lifts you up and squeezes you through the window."
2060 IF dr=10 THEN PRINT "you step into the little boat and pole across the black water."
2070 LET r=nx: LET ct=0: LET mv=1: GO SUB 2500: RETURN
2200 IF dr=3 THEN PRINT " the window is far above your reach.": RETURN
2210 IF dr=11 THEN PRINT " there is no way ";dn$(d);".": RETURN
2220 IF dr<=5 AND dst(dr)=0 THEN PRINT " the ";dm$(dr);" is locked.": RETURN
2230 IF dr<=5 THEN PRINT " the ";dm$(dr);" is shut.": RETURN
2240 IF dr<=9 THEN PRINT " a thick grey web bars the way.": RETURN
2250 PRINT " the black water is too wide and too cold to cross.": RETURN
2500 PRINT: PRINT "you are ";n$(r): LET x$=""
2510 FOR j=1 TO LEN e$(r) STEP 4: LET q=VAL (e$(r)(j)): IF q=0 THEN LET q=10
2520 LET dr=CODE (e$(r)(j+1))-48: IF dr>9 THEN LET dr=dr-7
2530 IF dr=0 OR (dr>5 AND dst(dr)=2) THEN LET x$=x$+dn$(q)+" "
2540 IF dr>0 AND dr<=5 THEN PRINT "to the ";dn$(q);" is the ";dm$(dr)
2550 IF dr>5 AND dr<=9 AND dst(dr)<2 THEN PRINT "to the ";dn$(q);" hangs a thick grey web"
2560 IF dr=10 AND dst(10)<2 THEN PRINT "to the ";dn$(q);" flows a black river"
2570 NEXT j: IF x$<>"" THEN PRINT "ways out: ";x$
2580 PRINT "you can see:": LET c=0: FOR i=1 TO 14: IF ol(i)=r THEN PRINT on$(i);".": LET c=1
2590 NEXT i: GO SUB 2700: IF c=0 THEN PRINT "      nothing of note"
2600 RETURN
2700 IF gl=r AND ol(1)=0 THEN PRINT "wendel the wizard, holding a faded chart.": LET c=1
2710 IF gl=r AND ol(1)<>0 THEN PRINT "wendel the wizard.": LET c=1
2720 IF th=1 AND mv=0 THEN PRINT "durrock the dwarf.": LET c=1
2730 IF r=6 THEN PRINT "aelric, lord of elmhaven.": LET c=1
2740 IF r=19 THEN PRINT "sliver, a pale creeping thing.": LET c=1
2750 IF r=42 THEN PRINT "harl the bowman.": LET c=1
2760 IF r=49 THEN PRINT "ashwyrm the dragon, asleep on a hill of gold.": LET c=1
2770 IF r=3 AND day=0 THEN PRINT "a fat ogre, clutching a big iron key."'"a lean ogre.": LET c=1
2780 IF r=24 AND wg=1 THEN PRINT "a grey wolf.": LET c=1
2790 RETURN
4000 LET tn=tn+1: LET ct=ct+1
4010 IF tn=1 AND gl=r THEN PRINT "wendel hands you the faded chart.": LET ol(1)=99
4020 IF tn=2 AND gl=r THEN PRINT "wendel pushes open the round oak door.": LET dst(1)=2
4030 IF tn=3 THEN LET gl=0: IF r=1 THEN PRINT "wendel strides off to the east."
4040 IF tn=8 THEN PRINT "the sun comes up.": LET day=1: LET ol(3)=3: LET n$(3)="in a clearing beside two ogres turned to stone"
4050 IF mv=1 THEN PRINT "durrock follows you in.": LET mv=0: GO TO 4080
4060 LET q=INT (RND*4): IF q=0 THEN PRINT "durrock stands about, scowling."
4070 IF q=1 THEN PRINT "durrock says "" we are wasting daylight ""."
4075 IF q=2 THEN PRINT "durrock sits on a rock and grumbles about lost gold."
4080 IF r=3 AND day=0 AND ct=1 THEN PRINT "the fat ogre says "" look what the night brought us. is it good eating? ""."'"the lean ogre says "" not much meat on it, but it will do "".": RETURN
4090 IF r=3 AND day=0 THEN PRINT "the fat ogre grabs you and swallows you whole.": GO TO 4500
4100 IF r=9 AND gd=0 AND ct=1 THEN PRINT "a crack in the floor grinds open."'"a scrawny goblin creeps in.": RETURN
4110 IF r=9 AND gd=0 THEN PRINT "the goblin seizes you and drags you down into the dark.": LET gd=1: LET r=11: LET ct=0: GO SUB 2500: RETURN
4120 IF r=26 AND ec=0 AND ct=1 THEN PRINT "an archer of the woodfolk steps from the trees.": RETURN
4130 IF r=26 AND ec=0 THEN PRINT "the archer binds your hands and marches you away.": LET ec=1: LET r=37: LET ct=0: LET bt=4: LET dst(5)=0: GO SUB 2500: PRINT "somebody locks the red cellar door behind you.": RETURN
4140 IF r=27 AND ct<3 THEN PRINT "pale bulging eyes watch you from the branches.": RETURN
4150 IF r=27 THEN PRINT "something drops from above and bites. its venom works fast.": GO TO 4500
4160 IF r=24 AND wg=1 AND ct<3 THEN PRINT "the grey wolf snarls and snaps at you."'"its teeth meet only your cloak.": RETURN
4170 IF r=24 AND wg=1 THEN PRINT "the wolf's jaws close on your throat.": GO TO 4500
4180 IF r=37 AND bt>0 THEN LET bt=bt-1: IF bt=0 THEN PRINT "the butler, red-faced with wine, unlatches the red cellar door and shuffles off.": LET dst(5)=2
4190 IF r=38 THEN PRINT "the woodfolk guards seize you and throw you back into your cell.": LET r=37: LET ct=0: LET bt=4: LET dst(5)=0: GO SUB 2500: RETURN
4200 IF r=6 AND ct=1 THEN PRINT "aelric says "" welcome, traveller ""."
4210 IF r=6 AND ol(14)=0 AND ct=2 THEN PRINT "aelric packs you a lunch for the road.": LET ol(14)=99
4220 IF r=6 AND em=1 AND mr=0 THEN GO SUB 4300
4230 IF r=19 THEN PRINT "sliver hisses "" what has it got hidden, my sweet? ""."
4240 IF r=42 THEN PRINT "harl says "" the beast sleeps on its gold beneath the crag. none who woke it came back ""."
4250 IF r=49 AND wr=0 THEN PRINT "one great eye opens. a gout of flame fills the den.": GO TO 4500
4260 IF r=49 THEN PRINT "ashwyrm snores on. the copper band hides you from its gaze."
4270 RETURN
4300 PRINT "aelric studies the faded chart by moonlight."'"aelric says "" the moon letters tell of a hidden way east from the shore of reedmere, and of a back door to the goblin caves west of the treeless gap "".": LET mr=1: LET dst(11)=2: RETURN
4500 PRINT "you have died.": GO SUB 4600: PRINT "press any key to try again.": PAUSE 0: GO TO 20
4600 LET sc=10*(kt+st+mr+gd+rt+ec)+20*(tt+won): PRINT "you have completed ";sc;"% of this quest.": RETURN
4700 PRINT "you heave the sack of gold into the oak chest and shut the lid."'"your quest is done, and the burrow is yours again.": LET won=1: GO SUB 4600: PRINT "press any key to play again.": PAUSE 0: GO TO 20
5100 GO SUB 1950: IF dr=0 THEN PRINT " pardon ?": GO TO 8000
5110 GO SUB 2000: GO TO 8010
5200 GO SUB 2500: GO TO 8010
5300 IF ob=0 AND w$(2)="" THEN PRINT " take what ?": GO TO 8000
5310 IF ob=0 THEN PRINT " there is no ";w$(2);" here.": GO TO 8000
5320 IF ol(ob)=99 THEN PRINT " you already have ";on$(ob);".": GO TO 8000
5330 IF ol(ob)<>r THEN PRINT " there is no ";w$(2);" here.": GO TO 8000
5340 IF of(ob)=1 THEN PRINT " ";on$(ob);" will not budge.": GO TO 8000
5350 LET ol(ob)=99: PRINT "you pick up ";on$(ob);".": IF ob=3 THEN LET kt=1
5360 IF ob=4 THEN LET st=1
5370 IF ob=7 THEN LET rt=1
5380 IF ob=12 THEN LET tt=1
5390 GO TO 8010
5400 IF ob=0 OR ol(ob)<>99 THEN PRINT " you are not carrying that.": GO TO 8000
5410 LET ol(ob)=r: PRINT "you put down ";on$(ob);".": IF ob=7 THEN LET wr=0
5420 GO TO 8010
5500 PRINT "you are carrying:": LET c=0: FOR i=1 TO 14: IF ol(i)=99 THEN PRINT on$(i);".": LET c=1
5510 NEXT i: IF c=0 THEN PRINT "      nothing at all"
5520 GO TO 8010
5600 IF w$(2)="chest" AND r=1 THEN LET co=1: PRINT "you lift the lid of the oak chest.": GO TO 8010
5610 IF w$(2)="hatch" AND r=39 THEN LET dst(12)=2: PRINT "you heave the hatch open. dark water rushes past below.": GO TO 8010
5620 IF w$(2)="window" THEN PRINT " the window is far above your reach.": GO TO 8000
5630 IF w$(2)<>"door" THEN PRINT " i see nothing here to open.": GO TO 8000
5640 GO SUB 1950: IF dr=0 THEN PRINT " i see no door here.": GO TO 8000
5650 IF dst(dr)=0 AND dr=2 AND ol(3)=99 THEN PRINT "the big iron key turns in the lock of the massive stone door.": LET dst(2)=1
5660 IF dst(dr)=0 THEN PRINT " the ";dm$(dr);" is locked.": GO TO 8000
5670 IF dst(dr)=2 THEN PRINT " the ";dm$(dr);" is already open.": GO TO 8000
5680 LET dst(dr)=2: PRINT "you open the ";dm$(dr);".": GO TO 8010
5700 IF w$(2)="chest" AND r=1 THEN LET co=0: PRINT "you close the oak chest.": GO TO 8010
5710 GO SUB 1950: IF dr=0 OR dst(dr)<>2 THEN PRINT " i see nothing here to close.": GO TO 8000
5720 LET dst(dr)=1: PRINT "you close the ";dm$(dr);".": GO TO 8010
5800 GO SUB 1950: IF dr=0 THEN PRINT " i see nothing here to unlock.": GO TO 8000
5810 IF dr<>2 OR ol(3)<>99 THEN PRINT " you have nothing that fits this lock.": GO TO 8000
5820 IF dst(2)>0 THEN PRINT " it is not locked.": GO TO 8000
5830 LET dst(2)=1: PRINT "the big iron key turns in the lock of the massive stone door.": GO TO 8010
5900 LET c$=w$(2): IF c$="durrock" AND th=1 THEN GO TO 5940
5910 IF c$="aelric" AND r=6 THEN GO TO 5970
5920 IF c$="sliver" AND r=19 THEN PRINT "sliver hisses "" we do not talk to thieves, my sweet "".": GO TO 8010
5925 IF c$="wendel" AND gl=r THEN PRINT "wendel says "" you are doing better than i expected "".": GO TO 8010
5930 PRINT " there is no ";c$;" here.": GO TO 8000
5940 IF w$(3)="open" AND w$(4)="window" AND r=11 THEN PRINT "durrock stretches up and forces the window open.": LET dst(3)=2: GO TO 8010
5950 IF w$(3)="carry" THEN PRINT "durrock sighs and hoists you onto his shoulders.": GO TO 8010
5960 PRINT "durrock says "" no "".": GO TO 8010
5970 IF (w$(3)="read" OR w$(3)="examine") AND w$(4)="chart" AND (ol(1)=99 OR em=1) THEN GO SUB 4300: GO TO 8010
5980 PRINT "aelric says "" ask me something i can help with "".": GO TO 8010
6000 PRINT "you bide your time."'"the moments drift by...": GO TO 8010
6100 IF w$(2)="wolf" AND r=24 AND wg=1 THEN GO TO 6150
6110 IF w$(2)="durrock" THEN PRINT "you swing at durrock."'"durrock is quicker. his axe ends the argument.": GO TO 4500
6120 IF (w$(2)="dragon" OR w$(2)="ashwyrm") AND r=49 THEN PRINT "ashwyrm stirs. a gout of flame fills the den.": GO TO 4500
6130 IF w$(2)="ogre" AND r=3 AND day=0 THEN PRINT "the fat ogre grabs you and swallows you whole.": GO TO 4500
6140 PRINT " there is no ";w$(2);" here to fight.": GO TO 8000
6150 IF ol(4)<>99 THEN PRINT "you lash out at the wolf."'"it dodges easily. bare hands are no use here.": GO TO 8010
6160 PRINT "you strike at the wolf with the bright blade."'"one clean blow, and the wolf falls dead.": LET wg=0: GO TO 8010
6200 IF ob=1 AND ol(1)=99 THEN PRINT "you unroll the faded chart."'"there are strange marks along one edge that you cannot read.": GO TO 8010
6210 IF ob=2 AND r=1 THEN PRINT "it is a stout oak chest.": IF co=1 THEN PRINT "the lid is open.": GO TO 8010
6215 IF ob=2 AND r=1 THEN PRINT "the lid is shut.": GO TO 8010
6220 IF ob>0 AND (ol(ob)=r OR ol(ob)=99) THEN PRINT "you look closely at ";on$(ob);"."'"it is just what it seems to be.": GO TO 8010
6230 PRINT " there is no ";w$(2);" here.": GO TO 8000
6300 PRINT "move with n s e w ne nw se sw u d or go <direction>."'"useful words: look, take, drop, inventory, open, close, unlock, examine, wait, kill, wear, remove, break, throw, put, climb, cross, give, score, quit."
6310 PRINT "to ask a companion, say to durrock ""open window""."'"bring the dragons gold home and put it in the chest.": GO TO 8000
6400 GO SUB 4600: PRINT "press any key to start again.": PAUSE 0: GO TO 20
6500 IF ob=7 AND ol(7)=99 THEN LET wr=1: PRINT "you slip the copper band on your finger and fade from sight.": GO TO 8010
6510 PRINT " you cannot wear that.": GO TO 8000
6600 IF ob=7 AND wr=1 THEN LET wr=0: PRINT "you take off the copper band and flicker back into view.": GO TO 8010
6610 PRINT " you are not wearing that.": GO TO 8000
6700 IF w$(2)="window" THEN PRINT "you rattle the bars of the window. nothing gives.": GO TO 8010
6710 LET dr=0: FOR j=1 TO LEN e$(r) STEP 4: IF e$(r)(j+1)>="6" AND e$(r)(j+1)<="9" THEN LET dr=VAL (e$(r)(j+1))
6720 NEXT j: IF dr=0 OR dst(dr)=2 THEN PRINT " there is no web here.": GO TO 8000
6730 IF ol(4)<>99 THEN PRINT " the web is too tough to tear by hand.": GO TO 8000
6740 PRINT "you slash the web apart with the bright blade.": LET dst(dr)=2: GO TO 8010
6800 IF ob=5 AND ol(5)=99 AND r=24 THEN PRINT "you hurl the rope across the black water. it snags the little boat on the far side, and you haul it over.": LET dst(10)=2: LET ol(13)=24: GO TO 8010
6810 IF ob=5 AND ol(5)<>99 THEN PRINT " you are not carrying the rope.": GO TO 8000
6820 PRINT " that would achieve nothing here.": GO TO 8000
6900 IF ob<>12 OR ol(12)<>99 OR r<>1 THEN PRINT " that would achieve nothing here.": GO TO 8000
6910 IF co=0 THEN PRINT " the chest is shut.": GO TO 8000
6920 GO TO 4700
7000 IF w$(2)="barrel" AND r=39 AND dst(12)=2 THEN GO TO 7030
7010 IF w$(2)="barrel" AND r=39 THEN PRINT " the hatch is shut.": GO TO 8000
7020 IF w$(2)="boat" AND (r=24 OR r=29) THEN LET d=3+(r=29): GO SUB 2000: GO TO 8010
7025 PRINT " you cannot climb that.": GO TO 8000
7030 PRINT "you squeeze into the barrel. the cellar hands roll it through the hatch and the river takes it."'"you bob along in the dark for a long, long time...": LET r=43: LET ct=0: LET mv=1: GO SUB 2500: GO TO 8010
7100 IF (ob=8 OR ob=14) AND ol(ob)=99 THEN LET ol(ob)=0: PRINT "you eat ";on$(ob);". much better.": GO TO 8010
7110 PRINT " you cannot eat that.": GO TO 8000
7200 IF ob=11 AND (ol(11)=r OR ol(11)=99) THEN PRINT "you take a swig of the wine. it is strong, and your head swims.": GO TO 8010
7210 PRINT " there is nothing here to drink.": GO TO 8000
7300 GO SUB 4600: GO TO 8000
7400 IF r=23 THEN PRINT "the current grabs you and smashes you against an iron grating.": GO TO 4500
7410 IF r=24 OR r=29 THEN LET d=3+(r=29): GO SUB 2000: GO TO 8010
7420 PRINT " there is no water here to cross.": GO TO 8000
7500 IF ob=1 AND ol(1)=99 AND r=6 THEN PRINT "you hand the faded chart to aelric.": LET ol(1)=0: LET em=1: PRINT "aelric says "" my thanks. let me look at this "".": GO TO 8010
7510 IF ob>0 AND ol(ob)=99 THEN PRINT "nobody here wants ";on$(ob);".": GO TO 8010
7520 PRINT " you have nothing like that to give.": GO TO 8000
8000 GO TO 200
8010 GO SUB 4000: GO TO 200
9000 DATA "in a snug round burrow dug into hollow hill","3102"
9010 DATA "on bleak open moorland, with grey hills rising ahead","4101300310035004"
9020 DATA "in a clearing stamped flat by heavy feet","800270061004"
9030 DATA "on a hidden track marked by huge footprints","20031205"
9040 DATA "in the ogres damp and smelly cave","2204"
9050 DATA "in elmhaven, a hidden valley of singing streams","40033007"
9060 DATA "on a hard high trail through the grey peaks","400630081040"
9070 DATA "on a narrow ledge above a sheer drop into a dim valley","400730101009"
9080 DATA "in a dry roomy cave that looks safe enough","2008"
9090 DATA "on a thin perilous path along the mountainside","40083020"
9100 DATA "in the goblins lockup, a cell of damp stone","14134312"
9110 DATA "in a twisting dark passage","131180137014"
9120 DATA "in a huge cavern lit by smoky torches","001450127411"
9130 DATA "in a cramped airless tunnel","901340101015"
9140 DATA "in a cramped airless tunnel","2014701630179013"
9150 DATA "in a cramped airless tunnel","30176015"
9160 DATA "in a cramped airless tunnel","101860154016"
9170 DATA "in a cramped airless tunnel","0014701720178019"
9180 DATA "on the shore of a cold black underground lake","1018"
9190 DATA "in the timber hall of ursk the skin-changer","4010502410212025"
9200 DATA "on the bank of the wide river","202050223024"
9210 DATA "high on bare mountain slopes","80217023"
9220 DATA "at the foaming forest river","1022"
9230 DATA "at the gloomy gate of the murkwold","402020253A29"
9240 DATA "on the forest road","10203026"
9250 DATA "deeper along the forest road","40253027"
9260 DATA "in the thick of the murkwold","40263028"
9270 DATA "beside a roaring waterfall","40272029"
9280 DATA "on the far bank of the black river","4A2410283030"
9290 DATA "in a part of the wood where the trees whisper","40295031"
9300 DATA "in a glade festooned with grey silk","80305632"
9310 DATA "in a dark hollow strung with webs","80311733"
9320 DATA "in a ring of white stones. a door of pale wood stands here","20323834"
9330 DATA "on a dim path through the trees","40333935"
9340 DATA "on a dim path where the ground grows soft","40343036"
9350 DATA "in a reeking bog","40353043"
9360 DATA "in a lightless cell beneath the woodkings halls","45388539"
9370 DATA "in the woodkings high halls","3537"
9380 DATA "in the woodkings cellar. a hatch is set in the floor","5537"
9390 DATA "at a treeless gap high in the grey peaks","20074041"
9400 DATA "outside a sealed goblin gate","3040"
9410 DATA "in reedmere town, built on stilts over the water","2043"
9420 DATA "on the shore of reedmere, the long lake","10423B444036"
9430 DATA "in a burnt and blasted land","40433045"
9440 DATA "among the ruins of kelder town","40441046"
9450 DATA "at the great gate of the ashen crag","20451047"
9460 DATA "in the lower halls under the crag","20469048"
9470 DATA "in a smooth sloping passage","00471049"
9480 DATA "in the dragons den, heaped with gold","2048"
9500 DATA "chart","a faded chart",0,0,"chest","a heavy oak chest",1,1,"key","a big iron key",0,0,"blade","a short bright blade",5,0
9510 DATA "rope","a coil of rope",5,0,"straw","some mouldy straw",11,0,"band","a dull copper band",17,0,"bread","a loaf of honey bread",20,0
9520 DATA "curtain","a thick wool curtain",20,1,"barrel","an empty wine barrel",39,1,"wine","a jug of strong wine",39,0,"hoard","a sack of the dragons gold",49,0
9530 DATA "boat","a small flat boat",29,1,"lunch","a packed lunch",0,0
9540 DATA "north","south","east","west","northeast","northwest","southeast","southwest","up","down"
9550 DATA "round oak door","massive stone door","high barred window","iron goblin door","red cellar door"
