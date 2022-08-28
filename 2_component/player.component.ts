import { Component, Input, Output, OnInit} from '@angular/core';
import { DraftPlayerService } from '../provider/draftplayer.service';
// import { PedalsService } from '../../core/provider/pedals.service';
import { OperationService } from '../provider/operation.service';
import { MaterialsService } from '../../core/provider/materials.service';
// import { TreeService, DraftNode  } from '../provider/tree.service';
import { Draft } from '../../core/model/draft';
import { T } from '@angular/cdk/keycodes';

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.scss']
})
export class PlayerComponent implements OnInit {

  @Input()  default_cell: number;
  @Input('draft') active_draft: Draft;
  // @Input() 
  // get draft_set(): boolean {
  //   return (this.pls.draft !== null);
  // };

  // get pls.draft(): Draft { return this._active_draft; }
  // set pls.draft(value: Draft) {
  //   this._active_draft = value;
  // }
  // private _active_draft: Draft = null;

  playOpen: boolean = true;
  draft_set: boolean = false;
  ownElement: HTMLElement;
  mixerElement: HTMLElement;
  draftCanvas: HTMLCanvasElement;
  cx: any;
  ink = 'neq'; //can be or, and, neq, not, splice

  constructor(
    public pls: DraftPlayerService,
    private ms: MaterialsService
  ) { 
    this.default_cell = 10;
  }

  ngOnInit(): void {
    console.log("ng on init, pedals: ", this.pls.pedals);
    /** FOR TESTING ONLY: generate random draft and set it at start-up */
  }

  ngAfterViewInit() {
    console.log("ng after view init, pedals: ", this.pls.pedals);
    // const startPattern = this.oss.getOp('tabby');
    // startPattern.perform([]).then((result) => {
    //   this.pls.setDraft(result[0]);
    //   this.drawDraft();
    // });
    this.ownElement = document.getElementById('player-container');
    this.mixerElement = document.querySelector('.mat-drawer-container');
    console.log("init w/ element refs ", this.ownElement, this.mixerElement);
    this.draftCanvas = <HTMLCanvasElement> document.getElementById('active-draft-canvas');
    this.cx = this.draftCanvas.getContext("2d");
    // this.drawDraft(); //force call here because it likely didn't render previously. 

    // let expansionPanel = document.querySelector('mat-expansion-panel');
    // expansionPanel.close();

    this.playOpen = false;
    this.resizeContainer();
    this.drawDraft();

    this.pls.redraw.on('redraw', () => {
      console.log("redrawing ", this.pls.state);
      this.drawDraft();
      this.resizeContainer();
    });

  }

  resizeContainer() {
    let h = this.ownElement.getBoundingClientRect().height;
    let t = document.querySelector("app-topbar").getBoundingClientRect().height;
    // console.log("player height is " + h.toString());
    this.mixerElement.style.height = 'calc(100vh - '+ (h+t).toString() + 'px)';
  }

  /**
   * COPIED FROM palette/subdraft
   * draw whetever is stored in the this.pls.draft object to the screen
   * @returns 
   */
   drawDraft(flipY: boolean = true) {

    if(this.draftCanvas === undefined) return;
    this.cx = this.draftCanvas.getContext("2d");
   
    if(this.pls.draft === null) {
      this.draftCanvas.width = 0;
      this.draftCanvas.height = 0;

    } else {
      this.draft_set = true;
      this.draftCanvas.width = (this.pls.draft.warps+2) * this.default_cell;
      this.draftCanvas.height = this.pls.draft.wefts * this.default_cell;

      for (let i = 0; i < this.pls.draft.wefts; i++) {
        for (let j = 0; j < this.pls.draft.warps; j++) {
          this.drawCell(this.default_cell, i, j, false, flipY);
        }
        if (i == this.pls.state.row) {
          this.drawProgressBar(this.default_cell, i, this.pls.draft.warps, flipY);
        }
      }
    }
  }

  drawCell(cell_size: number, i: number, j: number, usecolor: boolean, flipY: boolean = true){
    let is_up = this.pls.draft.isUp(i,j);
    let is_set = this.pls.draft.isSet(i, j);
    let color = "#ffffff"
    if(is_set){
      if(this.ink === 'unset' && is_up){
        this.cx.fillStyle = "#999999"; 
      }else{
        if(is_up){
          color = usecolor ? this.ms.getColor(this.pls.draft.getWarpShuttleId(j)) : '#000000';
        }else if (i == this.pls.state.row) { // highlight current row in yellow
          color = usecolor ? this.ms.getColor(this.pls.draft.getWeftShuttleId(i)) : '#ffff00';
        } else {
          color = usecolor ? this.ms.getColor(this.pls.draft.getWeftShuttleId(i)) : '#ffffff';
        }
        this.cx.fillStyle = color;
      }
    } else {
      this.cx.fillStyle =  '#0000000d';
    }
    let y = flipY ? this.pls.draft.wefts-1 - i : i;
    this.cx.fillRect((j+1)*cell_size, y*cell_size, cell_size, cell_size);
  }

  drawProgressBar(cell_size: number, i: number, width: number, flipY: boolean = true) {
    this.cx.fillStyle =  '#ffff00';
    let y = flipY ? this.pls.draft.wefts-1 - i : i;
    this.cx.fillRect(0, y*cell_size, cell_size, cell_size);
    this.cx.fillRect((width+1)*cell_size, y*cell_size, cell_size, cell_size);
  }
}
