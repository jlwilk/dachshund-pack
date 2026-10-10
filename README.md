# Dachshund Pack

"Dachshund" means "badger dog". Start with one pup, steer through gates to grow your pack, and let them fight their way through waves of badgers to the Badger King.

## How to play

- **Steer:** drag left and right (or move the mouse, or use ← → / A D). The pack runs forward on its own.
- **Gates:** each pair of gates gives you a choice. Blue gates add or multiply pups; red ones cost you. Some gates add a particular breed.
- **The pups fight for you:**
  - **Smooth** barks: quick single shots.
  - **Wire-haired** sprays a fan of bristles: good against crowds.
  - **Long-haired** takes three bites and runs at the front of the pack, shielding the others.
  - **Dapple** does zoomies: dashes into a badger, bowls it over, and runs back.
- **Badgers:** regular badgers swarm, honey badgers are fast, and armored badgers wear bucket helmets and take a beating.
- **The Badger King** stops the pack at the end of the lane and throws dirt clods. Bring enough pups to take him down.

Score is 10 per badger bopped plus 50 per pup that survives.

## Run locally

No build step and no dependencies. ES modules need to be served over HTTP:

    python3 -m http.server 8001

Then open http://localhost:8001/.

## Tests

    npm test

Uses Node's built-in test runner (Node 20+).
