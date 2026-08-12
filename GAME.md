# The game

*A definition of what is played. For how to run any of it, see [README.md](README.md).*

---

## In one paragraph

The map is the Països Catalans, town by town, and every town flies a television show.
When a town celebrates its **festa major** it hands out a booster box, and the box deals
cards: fighters from that town's show, each printed in one of six colours. Three of your
cards make a side. You take that side to a town and fight whoever is sitting on it —
either the house team the town's own geometry invented, or the three cards of the player
who took it before you. Win often enough and the town is yours: it starts flying your
lead's show, its boxes start dealing from your show, and the next challenger has to beat
you one more time than you had to beat the last holder. Fighting is the only thing in the
game that earns experience, levels are the only thing experience buys, and each level
you reach is one more box.

Nothing else. There is no currency, no shop, no energy bar, no trading, and no way to
grind: what a day is worth is the festes on the calendar, which is the same offer for
everybody.

---

## 1. The world

The map is a real one: every municipality of Catalunya, the País Valencià, les Illes
Balears, Catalunya Nord, Andorra and l'Alguer, drawn from the official boundary data and
stacked in four tiers — **territori → província → comarca → municipi**. You walk down it
by pressing, and up it by the breadcrumb. Andorra and l'Alguer have no comarca tier;
their towns hang directly off the territory.

**Every town flies a show.** It is not authored and it is not stored anywhere: the town's
own polygon is its seed, and the seed picks a show out of the pool. So a town has one show
for everybody who looks at it, forever, without a single row being written — and the same
town shows the same series to a player in Reus and a player in Perpinyà.

The pool is **every show with at least one castable character**. A show enters the map by
being given its first character and leaves it by losing its last. Nothing has to be
re-run, and no town whose borders have not moved ever changes show — unless somebody takes
it.

**A town somebody holds flies its holder's lead's show instead**, everywhere: on the pin,
in the panel, in what its boxes deal, and on the radio. Conquest re-labels the map.

---

## 2. The player

An account is an address and a password, or Google. That is all it is — there is no class,
no faction, no starting choice. What an account accumulates is:

- **Cards**, which are claimed and never lost.
- **A level**, from 1 to 20, derived from accumulated experience on the D&D 5e table.
  It is never stored as a number: it is read off the experience every time.
- **Avatars**, one dealt with every booster box — a portrait of a character in a
  particular colour. Holding the same character in two colours is holding two avatars.
  Until the first box is opened a player wears the initial of their name.
- **Towns held**, which is the only public standing there is.
- **A name**, chosen once, which is what every other player sees them as.

Every player has a public page: their avatar, level, side, cards and the towns they hold.

A brand new account is handed one thing before it is allowed to do anything else: the
**welcome box**. It deals five cards, and five cards are a side, so the game asks for a
side to be fielded the moment the box closes and does not let go until there is one. This
is the only interruption in the game.

---

## 3. Cards

A card is a **character**, a **colour**, and the **place it was pulled**. It carries the
place for the rest of its life, wherever it is later fielded — a card claimed in Alcoi is
an Alcoi card in a fight over Girona.

Cards are not consumed, not levelled, not equipped, not traded, and not recycled. A player
who claims the same character six times holds six statues, each in whatever colour it came
up in, each under the town it came from. There is no "collected" state that swallows the
copies.

**Rarity** is a property of the character, not of the card: each tier up is twice as
unlikely to be rolled out of a box as the tier below it. It changes nothing in a fight. A
legendary card and a common one fight identically — rarity is how often you see a face,
not how good it is.

---

## 4. Colour is the whole of a card

Every card has exactly one attribute, and it is its colour. There are six.

The three **primaries** each hand their fighter one of the three battlefield orders, taken
for free:

| Colour | Free order |
| ------ | ---------- |
| Red    | a **shot** |
| Yellow | a **charge** |
| Blue   | a **defend** |

The three **compounds** carry both of the primaries they mix, and take both at once:

| Colour | Mixes | Gets |
| ------ | ----- | ---- |
| Orange | red + yellow   | a free charge **and** a free shot |
| Green  | yellow + blue  | a free charge **and** a free guard |
| Purple | red + blue     | a free shot **and** a free guard |

Four rules hold the gift down, and they are the whole of it:

1. **Once, on the opening turn.** It is what a fighter opens with, not something banked
   for the turn it would pay best. Whatever is not taken by the end of turn one lapses.
2. **Never the order it was already given.** A gift happens *beside* what you chose, so it
   can never *be* what you chose: a red fighter ordered to shoot gets no second shot, and a
   blue one ordered to cover gets no second guard. Ordering the very thing your colour owes
   you is how you throw it away.
3. **Spent only when it does something.** A free charge on a fighter already loaded, a free
   guard on a turn nobody fires, a free shot with nothing to fire — none of these are it
   being taken. It simply runs out with the turn, which from the outside looks the same.
4. **The charge goes first.** Whichever of the two is a charge is resolved before anything
   else, because a charge is the one order another order needs. A red fighter told to load
   banks the charge and then fires its free shot out of that very charge.

So a compound is not twice the fighter. It is **one very good opening**, and then it is a
plain card. That is the whole of the colour economy: no colour is stronger over a long
fight, they are differently dangerous in the first thirty seconds of one.

---

## 5. Booster boxes

Boxes are the only way cards enter the game. There are three kinds and they are all the
same box with different writing across the head of it.

### The town box

A town deals boxes **for its festa major**, and the offer is open for eight days: from
three days before the celebration through four days after it. The Catalan day is what
counts, not the player's clock.

There are two stocks, and which one a town is printed on is read off the calendar, not off
who is asking:

- **White box** — the town is celebrating **today**. It deals the compounds: purple, green,
  orange.
- **Black box** — the festa is past or still to come inside the window. It deals the
  primaries: red, blue, yellow.

Inside a box the three colours are equally likely. The rare thing is not a colour, it is
the **white box**: there is one day of it against the window's other seven.

**One box per player, per town, per year, per stock.** A town deals two boxes a year to any
one player and no more — take either and it is taken. The year belongs to the *festa*, not
to the day somebody opened it, so a celebration on the 2nd of January is next year's box
even to a player opening it on the 30th of December.

The box deals from **the town's show** — which means from its holder's show wherever a
player has taken it. Conquest re-stocks a town's boxes as surely as it re-labels its pin.

### The welcome box

Dealt once to each account, on arrival. It belongs to no town and no year, says
*Benvinguda* where a place and a date would go, and is printed on the **white** stock —
the rare one, for the one box a player is given rather than has to go and find.

### The level boxes

One box for every level a player has reached, from the first. They are not a running total:
reaching level 4 with none of them opened is four boxes standing there, each opened on its
own and each on a show of the player's own choosing. They are printed on the **black**
stock — the everyday one, for the box that comes again.

### What is in a box

Five cards and one avatar. The cards are rolled from the show's assigned roster, weighted
by rarity, each taking one of the box's three colours. The avatar is drawn from those same
two possibilities — a character on that show, in one of that box's colours. An avatar
already held is not dealt twice; the box hands the held one back and still shows what it
gave.

### Finding a box

The map carries days of festes at once and puts no marks on the terrain to find them. The
**radar** is the one press that answers *where do I go next*: it reads the whole open
window and frames the map on the nearest box the player has not already taken. It rests a
minute between answers, so it cannot be held down to walk the window a town at a time.
Nothing is awarded by pressing it — the boxes it points at are there either way.

---

## 6. The side

A side is **any three of the player's own cards**. No colour has to be shared, no show has
to be common, nothing is hidden or greyed out on account of what is already fielded. The
first slot is the **lead**, and the lead is what names the side's show — which is the show
a captured town will fly.

The rules are: the cards must be yours, no card may be named twice, and the lead slot must
be filled. That is all of it.

An account that *can* field a side and has not is asked to before it is allowed anywhere
else. It is asked at most on arrival somewhere and when its cards first land — never in the
middle of an opening box, because a roster gate that fired the moment a pack completed a
side would pull the pack's own sheet out from under the player.

---

## 7. The fight

It is the schoolyard game — **charge, defend, shoot** — played by two teams of three at
once.

### The board

Three rows. The player's three fighters open on the near column, the rivals on the far one,
one pair to a row, facing each other across a **white column** in the middle that nobody
starts on. That column is the ground being fought over, lane by lane.

Nobody attacks sideways. The fight is **three private duels**, each between the two
fighters drawn level with each other, so a turn asks whether to strike and never at whom.

### The turn

Every turn, each fighter still standing is given one of the three orders. Both sides lock
in **blind**, and the orders are carried out together — a turn is a guess about what the
other side is about to do, never a reaction to it.

- **Charge** banks one charge. A fighter holds **one charge or none** — there is no
  hoarding — and it is the only way to get one. It leaves the fighter wide open for the
  turn it takes. Loading while already loaded is a wasted turn.
- **Defend** turns aside every shot aimed at that fighter this turn, and banks nothing.
  Spend the whole fight covering and you never fire.
- **Shoot** spends the charge and attacks straight across the lane: the fighter walks out
  of its cell, up to the one opposite, and hits it with its own melee move.

**One hit is all it takes.** There is no health, no damage number, no bar under anybody. A
fighter is standing or it is out.

Two fighters who go at each other in the *same* turn set off at the same moment, meet in
the middle of the lane, and their blows cancel — neither gets through, neither falls. A
blow stops a blow, a free one included, which is why a lane is never emptied on both sides
at once.

Who is dangerous can be read off the board at a glance: a fighter holding a charge
**burns**, an aura in its own colour, lit the turn it loads and out the turn it fires.

### Winning a lane, winning the fight

A lane is settled the turn it is decided: the winner walks up onto the white cell, and the
fighter it beat stays faded on the ground it lost. There is nowhere to withdraw to.

The fight is not to sudden death. It is three encounters and the score decides it — **two
lanes takes it outright**, the moment the second one falls, because the third cannot catch
it. Otherwise it is called when every encounter is settled, and at twenty turns at the
latest, on fighters left standing. Level is a draw. Two sides that only ever charge and
defend would otherwise circle forever.

**Conceding is a loss**, and it is the only way out of a fight you do not want to play —
you cannot walk away from one. Nobody is knocked down for it on either side, and it still
pays for whatever it had already felled, so giving up a fight half fought is worth more
than giving up one on turn one.

### The rivals

The other side is the town's team. It plays by exactly the same rules — same three orders,
same blind lock-in, same free orders from its own colours.

Its colour is also **how** it fights, and not only what it is given: where a choice is a
close one, a rival leans about twice as hard on the order its colour grants. A red rival is
the one that fires, a blue one the one that covers, a yellow one the one that keeps loading,
and a compound leans two ways of three. So a line of three colours plays three different
fights rather than the same fight three times. It is a lean and never a script — every
order stays well within reach, or a rival would be read once and beaten every turn after.

### Reading it

Each encounter is narrated in one sentence over the orders panel — the walk out, the blow,
the guard it came off or the fall it caused, all one event and one line. A row where
nothing was thrown gets a line too: two fighters standing off across a lane is a thing that
happened.

Each name is lettered in the colour its fighter fights in, with the mark of the order it
made in front of it, and the sentence is typed out a word at a time. Then the fight
**stops** and waits: the player is what carries it on, one encounter at a time. There is no
length of time that is right for both a reader and somebody who has seen it a hundred
times, so the game does not pick one.

The wording is authored, several ways of saying each thing, picked by a seed off the
encounter — so the words hold still while the blow they describe is thrown, and two
identical blows are not narrated identically. An event nobody has written a line for is
simply silent.

---

## 8. Territory

### Who is sitting there

Every town starts on its **house team** — three characters from its show, in colours the
town's own seed rolled. Nothing is stored for it; every player sees the same three, and the
town has always been like that.

Once a player takes the town, a row is written naming them and freezing **the three cards
they won with**, exactly as they stood. From then on that is what the map shows and what
the next challenger fights — frozen, so the holder recycling or re-fielding their cards
does not move it.

### Taking one

You challenge a town, you fight what is sitting on it, and a win banks one **siege win**.
Taking the town needs:

- **1 win** against an untouched town, still on its house team;
- **2 wins** against a town that has changed hands once;
- **3 wins** against one that has changed hands twice, and so on.

The longer a town has been fought over, the harder it is to shift the leader. Siege wins
are scoped to the generation they were earned against: **when a town flips, every siege on
it starts over**, including the new holder's rivals' progress.

### The pace

- **One open fight per player, ever.** Closing the arena, reloading, or moving to another
  device does not lose the fight and does not get you out of it. It is still there, on the
  turn it was left on, and it is the only one that can be played until it is finished.
- **One hour per town, per player, after a fight over it** — won, lost or given up. The
  clock starts when the fight is **reported**, not when it opened, so a long fight is never
  also a longer wait.
- **You cannot challenge a town you already hold.**

Between them, those three mean a siege is paced rather than ground out, and that the fight
in front of you is the fight you are in.

If the town changes hands while your fight is still running, the fight cost you nothing:
what you beat is no longer sitting there, so nothing is banked, no cooldown is charged, and
you may go straight back at whoever moved in.

### What a capture changes

The town's pin, panel, boxes and radio station all switch to the new holder's lead's show.
The town's turnover goes up, which is the next challenger's bar. And the fight is announced
to everybody.

---

## 9. Experience and levels

Fighting is the **only** source of experience in the game. Claiming cards earns nothing;
opening boxes earns nothing; holding towns earns nothing.

- A **win** earns a share of the whole span of the player's current level, scaled by how
  much of the side is left standing. A flawless win — nobody taken down — earns the level's
  **entire span**, which takes the player from the base of their level to the next one. A
  win with one of three left earns a third of it.
- A **loss** earns a flat **10 per rival it took down on the way out** — nothing to do with
  the level, the span or your own casualties. A loss that felled two is worth twice a loss
  that felled one; a whitewash is worth nothing.
- A **draw** earns nothing.

Levels run 1 to 20 on the D&D 5e cumulative table. At the cap a win earns nothing (there is
no next threshold), while a loss still pays, being measured against nothing.

What a level is worth: **one booster box, per level, for ever**. And that is the whole of
what a level buys. Levels do not make a fighter better — nothing does. Two players at
levels 3 and 19 field three cards each and fight the same fight.

---

## 10. The radio

**The player is a radio, and a show is a station.** Nothing on the plate chooses a song: a
station's songs are put in an order drawn from the day's seed, they run end to end from
that day's midnight and start again when they run out, and what is playing is whichever
song the clock lands in, at the second it lands on. So two players hear the same bar of the
same song without anything being stored, sent or agreed on, and a listener who pauses
rejoins where the station has got to rather than resuming.

**The map turns the dial**: to the show the open town flies, or the plurality of a region,
or the plurality of the whole map at the top view. So what is playing is about where the
reader is standing. Changing station is common and unasked-for, so a station **crossfades**
into the one it replaces rather than cutting. Turning the dial is never turning the sound
on — sound only ever starts from a press.

There is no skip. A radio has no next song.

---

## 11. The other rooms

- **The album** — every card the game has, show by show, with the ones the player holds
  standing at full strength and the rest as absences. It is what the collection *is*, as
  opposed to the roster, which is what they hold.
- **The roster** — one cell per card, every copy its own statue, in the colour it was
  pulled and under the town it came from. Also where the side is arranged.
- **The leaderboard** — every show that flies over at least one municipality, biggest
  first, with its share of the map. This is the closest thing to a global scoreboard, and
  it ranks **shows**, not players: a player's mark on the world is which series their
  conquests put on the map.
- **The feed** — everybody's fights as they finish, pushed the moment the server settles
  one, with a count of the ones you have not looked at on the button in the head of the
  arena.
- **Profiles** — any player's public page: avatar, level, side, cards, towns.
- **The festa calendar** — the local-holiday calendar the whole booster economy runs on,
  as it was baked from the official government datasets.

---

## 12. The shape of a day

Open the map. The radio is already playing whatever the place you are looking at flies.

Press the radar: it puts you on the nearest town with a box you have not taken. If it is
celebrating today, that is a white box — three compound cards' worth of very good openings.
If it is a day either side, it is black. Take it: five cards, one avatar, and the town's
show is stamped on all of them.

Then find a town worth taking. Somebody's town flies their lead's show, which tells you
what colours you are likely to be facing before you have seen a card of it. Field three of
yours, fight it, and either bank a win towards the number its turnover demands or take ten
a rival for the trouble. Either way that town shuts for an hour, and there are several
thousand others.

Somewhere in there a level lands, and a level is another box.

---

## 13. What the game deliberately does not have

- **No health, no stats, no power level.** A card is a character and a colour. Every
  fighter hits exactly as hard as every other, which is: once.
- **No progression that makes you stronger.** Levels buy boxes. Boxes buy variety, not
  power.
- **No grind.** Boxes come from the calendar, which is the same offer for everybody and
  cannot be farmed. There was once a daily allowance a player could earn into; it is gone.
- **No shop, no currency, no energy, no trading, no recycling.**
- **No PvP in real time.** You fight the *team* another player left sitting on a town, and
  it is frozen as it stood when they won it. Their being asleep does not defend it and their
  being online does not either.
- **No sudden death and no clock on a turn.** The fight waits for the reader.
- **No mark on the terrain telling you where to go.** The radar answers when asked; the
  map is not littered with pins for eight days of festes.
- **No English.** The game is played in Catalan, because it is set in the Països Catalans
  and there is nothing for a second language to be a fallback from.

---

## Glossary

| Term | What it means |
| ---- | ------------- |
| **Card / spawn** | One claimed instance of a character: a character, a colour, and the place it was pulled. |
| **Box** | A booster box. Five cards and one avatar. |
| **Stock** | Which card a box is printed on: white deals the compounds, black the primaries. |
| **Festa major** | A town's local festival. The window around it is when its boxes are open. |
| **Show** | A TV series. Every town flies one; every card comes from one; every station is one. |
| **House team** | The three fighters a town's own seed invented, sitting on it until somebody takes it. |
| **Holder** | The player occupying a town, and the frozen three they won it with. |
| **Turnover** | How many times a town has changed hands — and so how many wins the next challenger owes. |
| **Siege** | One challenger's banked wins against one town's current sitting team. |
| **Encounter / lane** | One of the three duels a fight is made of, between the two fighters drawn level. |
| **Charge** | The one thing a fighter can bank. One or none. Spent by shooting. |
| **Free order** | The order a colour hands its fighter for nothing, on the opening turn only. |
