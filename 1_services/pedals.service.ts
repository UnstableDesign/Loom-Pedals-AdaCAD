import { Injectable, Query } from '@angular/core';
import { DraftPlayerService, WeavingPick } from "../../mixer/provider/draftplayer.service";
import { Operation } from '../../mixer/provider/operation.service';
import { EventEmitter } from 'events';
import { getDatabase } from "firebase/database";
import { Database } from '@angular/fire/database';
import { DBListener, OnlineStatus, DBWriter, DBListenerArray } from './dbnodes.service';

export interface Pedal {
  id: number,
  name: string,
  u_name?: string,
  auto_name?: string,
  dbnode: DBListener,
  state: any,
  op?: Operation
}

export class PedalStatus extends EventEmitter {
  pi_online: OnlineStatus;     // is the pi online?
  loom_online: DBListener;   // is the loom online?
  vacuum_on: DBListener;     // is the loom running? (vacuum pump running)
  active_draft: DBWriter;
  num_pedals: DBListener;
  pedal_states: DBListener;
  loom_ready: DBListener;
  num_picks: DBWriter;
  pick_data: DBWriter;

  pedal_array: DBListenerArray;

  constructor(db: Database) {
    super();
    const defaults = {
      active_draft: false,
      num_picks: 0,
      pick_data: false
    }
    const listeners = {
      // pi_online: 'pi-online',
      loom_online: 'loom-online',
      vacuum_on: 'vacuum-on',
      num_pedals: 'num-pedals',
      pedal_states: 'pedal-states',
      loom_ready: 'loom-ready'
    }
    const writers = {
      active_draft: 'active-draft',
      num_picks: 'num-picks',
      pick_data: 'pick-data'
    }

    this.pi_online = new OnlineStatus({ db: db, root: 'pedals/', path: 'pi-online'});
    // this.pi_online.attach();
    // this.loom_online = new DBListener(this.db, 'loom-online');

    for (var l in listeners) {
      const newL = new DBListener({db: db, root: 'pedals/', path: listeners[l]});
      Object.defineProperty(this, l, { value: newL });
      // this[l].attach();
    }

    for (var w in writers) {
      const newW = new DBWriter({db: db, root: 'pedals/', path: writers[w], initVal: defaults[w]});
      // console.log('writer created');
      Object.defineProperty(this, w, { value: newW });
      // console.log('writer added to status');
      this[w].attach();
      // console.log('writer attached');
      this[w].setVal(defaults[w]);
    }

    this.pedal_array = new DBListenerArray(this.num_pedals, this.pedal_states);
  }

  toString() {
    var str = "";
    str += "'pi-online': " + this.pi_online.val + "\n";
    str += "'loom-online': " + this.loom_online.val + "\n\n";
    str += "'vacuum-on': " + this.vacuum_on.val + "\n";
    str += "'active-draft': " + this.active_draft.val + "\n";
    str += "'num-pedals': " + this.num_pedals.val + "\n";
    return str;
  }
}

/**
 * Definition of pedal provider
 * @class
 */
@Injectable({
  providedIn: 'root'
})
export class PedalsService {

  db: Database;
  dbNodes: Array<any>;

  // status data
  status: PedalStatus;
  //  default = {
  //     pi_online: false,     // is the pi online?
  //     loom_online: false,   // is the loom online?
  //     vacuum_on: false,     // is the loom running? (vacuum pump running)
  //     active_draft: false,
  //     num_pedals: 0,
  //     pedal_states: {},
  //     loom_ready: false     // is the loom requesting a draft row?
  // };
  pedals: Array<Pedal> = [];

  constructor() { 
    // init: start listening to changes in Firebase DB from the Pi
    console.log("pedals service constructor");
    this.db = getDatabase();
    this.status = new PedalStatus(this.db);
    // console.log(this.status);
    
    // if pi_online = "true" at start-up, just make sure
    console.log("are you alive?");
    this.pi_online.checkAlive();
    this.loomPedals(false);

    // listens for changes in pi online status
    // if online, enable everything
    this.pi_online.on('change', (state) =>
      this.loomPedals(state));

    // other listeners
    this.loom_online.on('change', (state) => 
      this.loomListeners(state));

    this.pedal_array.on('ready', (state) => 
      this.weavingWriters(state));

    this.pedal_array.on('child-added', (newNode) => {
      this.pedals.push(this.nodeToPedal(newNode));
      this.pedal_array.emit('pedal-added', this.pedals.length);
    })

    /** @todo */
    this.pedal_array.on('child-change', (e) => {
      console.log("child change ", e);
      this.pedals[e.id].state = e.val;
      // e = {id: which pedal's id, val: pedal state}
      // call pedal.execute or whatever it ends up being
      // this.player.onPedal(e.id, e.val);
    });

    /** @todo */
    this.loom_ready.on('change', (state) => {
      if (state) {
        // send the next weaving row to DB
        // update num_picks and pick_data accordingly
      }
    });
  }

  get pi_online() { return this.status.pi_online; }
  get loom_online() { return this.status.loom_online; }
  get vacuum_on() { return this.status.vacuum_on; }
  get active_draft() { return this.status.active_draft; }
  get num_pedals() { return this.status.num_pedals; }
  get pedal_states() { return this.status.pedal_states; }
  get loom_ready() { return this.status.loom_ready; }
  get num_picks() { return this.status.num_picks; }
  get pick_data() { return this.status.pick_data; }
  get pedal_array() { return this.status.pedal_array; }
  
  get readyToWeave() { return (this.loom_online.val && this.pedal_array.ready); }

  // attach all listeners to other values in DB
  loomPedals(state: boolean) {
    if (state) {
      this.loom_online.attach();
      this.pedal_array.attach();
    } else {
      this.loom_online.detach();
      this.pedal_array.detach();
    }
  }

  loomListeners(state: boolean) {
    if (state) {
      this.vacuum_on.attach();
      this.loom_ready.attach();
    } else {
      this.vacuum_on.detach();
      this.loom_ready.detach();
    }
    this.weavingWriters(this.readyToWeave);
  }

  weavingWriters(state: boolean) {
    if (state) {
      this.active_draft.attach();
      this.num_picks.attach();
      this.pick_data.attach();
    } else {
      this.active_draft.detach();
      this.num_picks.detach();
      this.pick_data.detach();
    }
  }

  toggleWeaving() {
    // this.active_draft.attach();
    // console.log("toggle weaving");
    let vac = !this.vacuum_on.val;
    console.log("vacuum is turning ", vac);
    this.active_draft.setVal(vac);
  }

  /** @todo */
  sendDraftRow(r: WeavingPick) {
    this.num_picks.setVal(r.pickNum);
    this.pick_data.setVal(r.rowData);
  }

  nodeToPedal(node) {
    console.log(node);
    let p: Pedal = { id: node.id, name: node.name, dbnode: node, state: node.val };
    return p;
  }
}
