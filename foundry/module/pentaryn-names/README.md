# pentaryn-names

Renaming an actor renames its token labels: the prototype token and every placed token of that
actor on every scene. Foundry keeps the two separate on purpose, so token nicknames are possible.
This keeps that, with one rule:

- A label that **was the old actor name**, or **the part before its first comma**
  (`Glubbek` for `Glubbek, Kuo-toa Net-Mender`), follows the rename in the same form.
- Any other label is a **deliberate nickname** and is never touched.

Runs on the client that made the rename (a player renaming their own PC updates only tokens they
can edit). A toast reports how many labels changed.

API: `game.pentaryn.names.sync(actor, oldName, newName)`, `.relabel(label, old, new)`, `.shortName(name)`.

Sync: `make foundry-names-check` / `make foundry-names-sync`. First install needs a server restart.
