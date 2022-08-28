import { Injectable } from '@angular/core';
import { getDatabase, child, ref, set, get, query, onValue, DatabaseReference, onChildAdded, onChildChanged, onChildRemoved} from "firebase/database";
import { Database } from '@angular/fire/database';
import { EventEmitter } from 'events';
import { NumericDataType } from '@tensorflow/tfjs';

interface NodeParams {
  db?: Database,
  name?: string,
  root?: string,
  path?: string,
  key?: string,
  initVal?: any,
  ref?: DatabaseReference,
  id?: number
}

/**
 * @class DBNode
 * @desc Wrapper for a Firebase database ref and
 * the value stored at that DB node.
 */
class DBNode extends EventEmitter {
  id: number;
  _name: string;
  _dbref: DatabaseReference;
  _val: any;
  _active: boolean;

  /**
   * holds the Unsubscribe functions that are returned by
   * DB event functions like onValue(...)
   */
  unsubscribers: Array<Function>;

  /**
   * 
   * @param {*} params \{ db: Database, path: string, initVal: any }
   * @param {*} params \{ ref: DatabaseReference, key: string, initVal: any }
   */

  constructor(params: NodeParams) {
    super();
    this.active = false;
    this.unsubscribers = [];
    if (params.db) {
      this._name = params.path;
      this._dbref = ref(params.db, params.root + params.path);
      this._val = params.initVal;
      // console.log(this);
    } else if (params.ref) {
      this._name = params.key;
      this._dbref = params.ref;
    }

    if(params.id > -1) {
      this.id = params.id;
    }
    console.log(this.name);
  }

  get ref() {
    return this._dbref;
  }

  get name() {
    return this._name;
  }

  get val() {
    if (!this.active) {
      return false;
    }

    if (typeof(this._val) == 'number' || typeof(this._val == 'boolean')) {
      return this._val;
    } 
    
    if (this._val != undefined) {
      return Object.keys(this._val);
    }
  }

  set val(x) {
    this._val = x;
  }

  get active() {
    return this._active;
  }

  set active(tf: boolean) {
    this._active = tf;
  }

  // methods for a node: 
  // attach() means it is updating with the database and emitting events
  // detach() means it is not updating, no events
}

/**
 * @class DBListener
 * @desc A DBNode that only reads from the database.
 * When `active = true`, will emit events on the value changing.
 */
export class DBListener extends DBNode {
  id: number;
  _name: string;
  _dbref: DatabaseReference;
  _val: any;
  _active: boolean;

  constructor(params: NodeParams) {
    super(params);
  }

  attach() {
    this.active = true;
    let unsub = onValue(this.ref, (snapshot) => {
      this.val = snapshot.val();
      this.emit('change', this.val);
    });
    this.unsubscribers.push(unsub);
  }

  getNow() {
    get(query(this.ref))
      .then((snapshot) => {
        this.val = snapshot.val();
      })
      .catch(result => console.log(result));
  }

  detach() {
    if (this.active) {
      while (this.unsubscribers.length > 0) {
        let unsub = this.unsubscribers.pop();
        unsub();
      }
    }
    this.active = false;
  }
}

/**
 * @class DBWriter
 * @desc A DBNode that only writes to the database. 
 * When `active = true`, will pass `val` to the database.
 */
export class DBWriter extends DBNode {
  id: number;
  _name: string;
  _ref: DatabaseReference;
  _val: any;
  _active: boolean;

  constructor(params: NodeParams) {
    super(params);
  }

  attach() {
    this.active = true;
  }

  setVal(x) {
    this.val = x;
    if (this.active) {
      set(this.ref, this.val);
    }
  }

  detach() {
    this.active = false;
  }
}

/**
 * @class `DBListenerArray`
 * @desc Represents a listener to a list of values in the database 
 * (generalizes to `DBNodeArray`). Assumes that the data list is
 * structured such that `lengthNode` is a `DBListener` that stores the 
 * length of the list, while `parentNode` is a `DBListener` to the parent
 * node of the list. Each item in the list is a child of `parentNode`,
 * which is then stored as a `DBListener` in the array `nodes`.
 */
export class DBListenerArray extends EventEmitter {
  lengthNode: DBListener;
  parentNode: DBListener;
  nodes: Array<DBListener>;

  /**
  * holds the Unsubscribe functions that are returned by
  * DB event functions like onValue(...)
  */
  unsubscribers: Array<Function>;

  constructor(lengthNode: DBListener, parentNode: DBListener) {
    super();
    this.lengthNode = lengthNode;
    this.parentNode = parentNode;
    this.nodes = [];
    this.unsubscribers = [];
  }

  get length() {
    // console.log("length is ", this.nodes.length);
    return this.nodes.length;
  }

  get active() {
    return (this.lengthNode.active && this.parentNode.active);
  }

  get ready() {
    return (this.lengthNode.val > 0 && this.parentNode.val != false);
  }

  // checkReady() {
  //   if (this.ready) {
  //     this.emit('ready', {
  //       length: this.lengthNode.val,
  //       data: this.parentNode.val
  //     });
  //   }
  // }

  /**
   * @method attach
   */
  attach() {
    this.lengthNode.attach();
    this.lengthNode.on('change', (val) => {
        this.emit('ready', this.ready);
    });

    this.parentNode.attach();
    this.parentNode.once('change', (val) => {
      this.emit('ready', this.ready);
    });

    for (var node of this.nodes) {
      this.attachChildNode(node);
    }

    this.unsubscribers.push(
      onChildAdded(this.parentNode.ref, (snapshot) => {
        // console.log("child added", snapshot);
        this.addNode(snapshot.key);
    }));

    this.unsubscribers.push(
      onChildChanged(this.parentNode.ref, (snapshot) => {
        console.log("child changed", snapshot);
    }));

    this.unsubscribers.push(
      onChildRemoved(this.parentNode.ref, (snapshot) => {
        // console.log("child removed", snapshot);
        this.popNode();
        this.emit('child-removed');
    }));
  }

  detach() {
    if (this.active) {
      while (this.unsubscribers.length > 0) {
        let unsub = this.unsubscribers.pop();
        unsub();
      }
    }
  }

  nodeAt(n: number) {
    // console.log(this.nodes);
    // console.log("node at ", n);
    // console.log(this.nodes[n]);
    return this.nodes[n];
  }

  pushNode(n: DBListener) {
    this.nodes.push(n);
  }

  popNode() {
    return this.nodes.pop();
  }

  /**
   * Creating a new child node.
   * @param key 
   */
  addNode(key: string) {
    console.log('child key', key);
    const childRef = child(this.parentNode.ref, key);
    const childNode = new DBListener({ ref: childRef, key: key, id: this.length });
    this.attachChildNode(childNode);
    this.pushNode(childNode);
    this.emit('child-added', childNode);
    // this.lengthNode.setVal(this.length);
  }

  /**
   * Attaching a child node that was created elsewhere.
   * Invokes child's `attach()` method and adds event listener
   * that will emit a `child-change` event.
   * @param node 
   */
  attachChildNode(node: DBListener) {
    node.attach();
    node.on('change', (val) => {
      this.emit('child-change', {
        id: node.id,
        val: val
      });
    });
  }

  // remNode() {
  //   const node = this.popNode();
  //   // remove(node.ref);
  //   // this.lengthNode.setVal(this.length);
  // }

  // updateArray(num: number) {
  //   // this.parentNode.getNow();
  //   if (num > this.length) {
  //     let parentKeys = this.parentNode.val;
  //     // console.log(this.parentNode);
  //     console.log(parentKeys);
  //     let childKeys = Object.keys(parentKeys);
  //     while (this.length < num) {
  //       this.addNode(childKeys[this.length]);
  //     }
  //   } else if (num < this.length) {
  //     while (this.length > num) {
  //       this.popNode();
  //     }
  //   }
  //   console.log(this);
  // }

  toString() {
    var str = "";
    // str += "length: " + this.length + ", ";
    str += "[ \n";
    for (var i=0; i < this.nodes.length; i++) {    
      // str += "\t" + this.nodes[i].name + ": "; 
      str += this.nodes[i].val;
      if (i < this.nodes.length-1) {
        str += ",";
      }
      str += " \n";
    } 
    str += " ]";
    return str;
  }
}

export class OnlineStatus extends DBListener {
  _name: string;
  _ref: DatabaseReference;
  _val: boolean;
  _active: boolean;

  constructor(params) {
    super(params);
    this.attach();
    get(query(this.ref))
      .then((snapshot) => {
        this.val = snapshot.val();
      })
      .catch(result => console.log(result));
  }

  checkAlive() {
    set(this.ref, false)
      .then(() => { this.emit('set', true); })
      .catch(() => { this.emit('set', false); });
  }
}


@Injectable({
  providedIn: 'root'
})
export class DbNodesService {

  constructor() { }
}
