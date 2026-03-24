(function () {
  const template=document.createElement("template");
  template.innerHTML=`
      <style>
        :host { display:block; width:100%; height:100%; }
        iframe { position:absolute; top:0; left:0; width:100%; height:100%; border:none; }
      </style>
      <iframe id="frame"></iframe>
  `;

  class VariableWidthMACC extends HTMLElement {
    constructor(){
      super();
      this._shadow=this.attachShadow({mode:"open"});
      this._shadow.appendChild(template.content.cloneNode(true));
      this._frame=this._shadow.querySelector("#frame");

      this._data={project:[],category:[],abatement:[],mac:[],cumulative:[],npv:[],capex:[],opex:[]};
      this._onMessage=this._onMessage.bind(this);
    }

    getDataBindings(){
      return {
        maccBinding:{
          feeds:[
            {id:"dimension",type:"dimension"},
            {id:"dimension_cat",type:"dimension"},
            {id:"measure_abate",type:"mainStructureMember"},
            {id:"measure_mac",type:"mainStructureMember"},
            {id:"measure_cum",type:"mainStructureMember"},
            {id:"measure_npv",type:"mainStructureMember"},
            {id:"measure_capex",type:"mainStructureMember"},
            {id:"measure_opex",type:"mainStructureMember"}
          ]
        }
      };
    }

    connectedCallback(){window.addEventListener("message",this._onMessage);}
    disconnectedCallback(){window.removeEventListener("message",this._onMessage);}

    onCustomWidgetBeforeUpdate(p){if(p.maccBinding)this._ingest(p.maccBinding);}
    onCustomWidgetAfterUpdate(p){if(p.maccBinding)this._ingest(p.maccBinding);}

   _ingest(binding){
  const rows = [];

  // 1. Build row objects from SAC binding data
  for(const r of binding.data || []){
    rows.push({
      name: r.dimension_0?.label ?? r.dimension_0?.id ?? "",
      cat:  r.dimension_cat_0?.label ?? "",
      abate: Number(r.measure_abate_0?.raw) || 0,
      mac:   Number(r.measure_mac_0?.raw) || 0,
      npv:   Number(r.measure_npv_0?.raw) || 0,
      capex: Number(r.measure_capex_0?.raw) || 0,
      opex:  Number(r.measure_opex_0?.raw) || 0
    });
  }

  // 2. Sort rows by MAC (core MACC logic)
  rows.sort((a,b)=> a.mac - b.mac);

  // 3. Rebuild TRUE cumulative abatement
  let cum = 0;
  for(const r of rows){
    cum += r.abate;
    r.cum = cum;
  }

  // 4. Store final arrays for the iframe chart
  this._data = {
    project:    rows.map(r=>r.name),
    category:   rows.map(r=>r.cat),
    abatement:  rows.map(r=>r.abate),
    mac:         rows.map(r=>r.mac),
    cumulative:  rows.map(r=>r.cum),
    npv:        rows.map(r=>r.npv),
    capex:      rows.map(r=>r.capex),
    opex:       rows.map(r=>r.opex)
  };

  this._render();
}
    _onMessage(evt){
      if(evt.source!==this._frame.contentWindow)return;

      if(evt.data?.type==="bar_click"){
        this.dispatchEvent(new CustomEvent("onSelect",{
          detail:{selectedMembers:evt.data.selectedMembers}
        }));
      }
    }

    _render(){
      this._frame.src="https://sandeep-roy.github.io/EHS_MACC_2026/iframe.html?v=2";

      let attempts=0;
      const trySend=()=>{
        if(!this._frame.contentWindow){
          attempts++;
          if(attempts<50)setTimeout(trySend,100);
          return;
        }
        this._frame.contentWindow.postMessage({
          type:"update",
          payload:this._data
        },"*");
      };

      this._frame.onload=()=>{attempts=0;trySend();};
    }
  }

  customElements.define("variable-width-macc",VariableWidthMACC);
})();
