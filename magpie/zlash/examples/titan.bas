5 REM touch: >n=N >s=S >e=E >w=W >u=UP >d=DOWN >look=LOOK >i=INV >help=HELP enter
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
