# Dachshund Pack

"Dachshund" means "badger dog". Start with one pup, steer through gates and shoot open crates to grow your pack, and let them fight their way through waves of badgers to the Badger King.

## How to play

- **Hold the road:** your pack stands its ground while everything comes at it: gates, crates, fences and the badgers themselves. Drag left and right (or move the mouse, or use ← → / A D) to slide the pack across the road.
- **Gates:** each pair of gates slides toward you and gives you a choice. Blue gates add or multiply pups; red ones cost you. Some gates add a particular breed.
- **Three-lane splits:** now and then low fences split the lane in three. The left lane ends in a crate and the right in a tougher steel cage, each showing how much shooting it needs and the prize inside. Shoot one open from its lane to free the pups. The middle lane is where the badger horde comes, and the fences keep them there. If you don't open a crate in time, your pups just squeeze past it.
- **Merging:** when the pack gets big, pups of the same breed merge: five pups make a **Big** dog, five Big dogs a **Mega-long** dog (×25), and five of those an **Ultra-long** dog (×125). Being dachshunds, they mostly get longer. A merged dog hits as hard as all its pups (its barks blast through a line of badgers) and loses one pup's worth per bite, so the count stays honest — and the pack stays narrow enough to steer.
- **The pups fight for you:**
  - **Smooth** barks: quick single shots.
  - **Wire-haired** sprays a fan of bristles: good against crowds.
  - **Long-haired** takes three bites and runs at the front of the pack, shielding the others.
  - **Dapple** does zoomies: dashes into a badger, bowls it over, and runs back.
- **Badgers** march at you from far up the road, so the pups (smooths bark about 20 m) pick them off as they come. They get tougher the further you get. Regular badgers swarm, honey badgers are fast, and armored badgers wear bucket helmets and take a beating.
- **The Badger King** comes last: the road stops and he lumbers toward you, throwing dirt clods. Bring enough pups to take him down.

Score is 10 per badger bopped plus 50 per pup that survives.

## Run locally

No build step and no dependencies. ES modules need to be served over HTTP:

    python3 -m http.server 8001

Then open http://localhost:8001/.

## Tests

    npm test

Uses Node's built-in test runner (Node 20+).
