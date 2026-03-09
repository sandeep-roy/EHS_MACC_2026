(function () {

  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display:block; width:100%; height:100%; }
      #frame {
        width:100%;
        height:100%;
        border:0;
        overflow:hidden;
      }
    </style>
    <iframe id="frame" title="MACC Plotly Frame"></iframe>
  `;

  class VariableWidthMACC extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode:"open" });
      this._shadow.appendChild(template.content.cloneNode(true));
      this._frame = this._shadow.querySelector("#frame");

      this._data = { project:[], abatement:[], mac:[] };
      this._dimTechId = "dimension";  // fallback
      this._onMessage = this._onMessage.bind(this);
    }

    /* Data bindings for SAC */
    getDataBindings() {
      return {
        maccBinding: {
          feeds: [
            { id:"dimension",     type:"dimension" },
            { id:"measure_abate", type:"mainStructureMember" },
            { id:"measure_mac",   type:"mainStructureMember" }
          ]
        }
      };
    }

    connectedCallback()   { window.addEventListener("message", this._onMessage); }
    disconnectedCallback() { window.removeEventListener("message", this._onMessage); }

    onCustomWidgetBeforeUpdate(props){ if (props.maccBinding) this._ingest(props.maccBinding); }
    onCustomWidgetAfterUpdate(props){  if (props.maccBinding) this._ingest(props.maccBinding); }

    /* Extract SAC rows */
    _ingest(binding) {
      const rows = binding.data || [];

      try {
        const md = binding.metadata;
        this._dimTechId = md?.dimensions?.[0]?.id || md?.dimensions?.[0]?.key || "dimension";
      } catch (_) { this._dimTechId = "dimension"; }

      const proj=[], ab=[], mc=[];
      for (const r of rows) {
        const d=r.dimension_0||r.dimensions_0||r.dimensions?.[0]||{};
        proj.push(String(d.description??d.text??d.label??d.id??""));
        ab.push(+((r.measure_abate_0?.raw??r.measure_abate_0) || r.measures?.[0]?.raw || 0));
        mc.push(+((r.measure_mac_0?.raw??r.measure_mac_0) || r.measures?.[1]?.raw || 0));
      }
      this._data={project:proj, abatement:ab, mac:mc};
      this._render();
    }

    /* Handle messages from iframe (Linked Analysis) */
    _onMessage(evt) {
      const msg = evt.data;
      if (!msg) return;

      try {
        const db = this.dataBindings.getDataBinding();
        const la = db.getLinkedAnalysis();

        if (msg.type === "macc_selection_changed") {
          if (!la.isDataPointSelectionEnabled()) return;
          const labels = msg.payload?.labels || [];
          if (labels.length === 0) { la.removeFilters(); return; }

          const selections = labels.map(l => ({ [this._dimTechId]: String(l) }));
          la.setFilters(selections);
        }

        if (msg.type === "macc_clear_selection") {
          la.removeFilters();
        }

      } catch(e) { console.error("[MACC] Linked Analysis error:", e); }
    }

    /* Render iframe content */
    _render() {
      const {project, abatement, mac} = this._data;

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
  <style>
    html,body {margin:0;height:100%;}
    #chart { width:100%; height:100%; min-height:480px;}
  </style>
</head>
<body>
  <div id="chart"></div>

  <script>
    const project = ${JSON.stringify(project)};
    const abate   = ${JSON.stringify(abatement)};
    const mac     = ${JSON.stringify(mac)};

    const selected = new Set();

    function draw(){
      const rows = project.map((p,i)=>({Project:p,Abate:+abate[i]||0,MAC:+mac[i]||0}))
                          .sort((a,b)=>a.MAC-b.MAC);

      const total = rows.reduce((s,r)=>s+r.Abate,0);
      let cum=0;
      const x=[],y=[],w=[],cd=[],labels=[];

      const MIN_PX=18;
      const pxToDom = total>0 ? total/window.innerWidth : 1;

      rows.forEach(r=>{
        const ww=Math.max(r.Abate,MIN_PX*pxToDom);
        const mid=cum+ww/2;
        x.push(mid); y.push(r.MAC); w.push(ww);
        cd.push([r.Project,r.Abate]);
        labels.push(r.Project);
        cum+=ww;
      });

      const colors = y.map(v=> v<0
        ? "rgba(39,174,96,0.95)"
        : v<25 ? "rgba(241,196,15,0.95)"
        : v<50 ? "rgba(230,126,34,0.95)"
        : "rgba(231,76,60,0.95)"
      );

      const lineW = labels.map(l=>selected.has(l)?3:1.5);
      const opac  = labels.map(l=> selected.size===0?1:(selected.has(l)?1:0.35));

      const bar={
        type:"bar", x,y,width:w,
        marker:{color:colors,line:{color:"black",width:lineW},opacity:opac},
        customdata:cd,
        hovertemplate:"<b>%{customdata[0]}</b><br>MAC: %{y}<br>Abatement: %{customdata[1]}<extra></extra>"
      };

      const xPad = cum*0.03;
      const xr=[-xPad,cum+xPad];
      const ymin=Math.min(...y,0)*1.25;
      const ymax=Math.max(...y,0)*1.25;

      const layout={
        margin:{t:50,l:80,r:40,b:60},
        hovermode:"closest",
        shapes:[
          {type:"line",x0:60000,x1:60000,y0:ymin,y1:ymax,line:{color:"black",width:3,dash:"dash"}},
          {type:"line",x0:xr[0],x1:xr[1],y0:50,y1:50,line:{color:"blue",width:3,dash:"dot"}}
        ],
        annotations:[
          {x:60000,y:ymax*0.95,text:"Target: 60k tCO₂e",showarrow:false},
          {x:xr[1],y:50,text:"Carbon price: 50 EUR/tCO₂e",xanchor:"right",showarrow:false}
        ],
        xaxis:{title:"Total Abatement (tCO₂e)",range:xr,tickformat:"~s"},
        yaxis:{title:"MAC (EUR/tCO₂e)",zeroline:true}
      };

      const el=document.getElementById("chart");
      Plotly.newPlot(el,[bar],layout,{responsive:true,displaylogo:false}).then(()=>{

        // Click: single or multi-select
        el.on("plotly_click",ev=>{
          const p=ev.points?.[0];
          if(!p) return;
          const label=p.customdata[0];
          const multi=ev.event?.ctrlKey||ev.event?.metaKey||ev.event?.shiftKey;

          if(multi){ selected.has(label)?selected.delete(label):selected.add(label); }
          else { selected.clear(); selected.add(label); }

          window.parent.postMessage({
            type:"macc_selection_changed",
            payload:{labels:[...selected]}
          },"*");

          draw();
        });

        // Double click → clear
        el.on("plotly_doubleclick",()=>{
          selected.clear();
          window.parent.postMessage({type:"macc_clear_selection"},"*");
          draw();
        });

      });
    }

    (function wait(){ if(window.Plotly) draw(); else setTimeout(wait,30);})();
    window.addEventListener("resize",()=>{ if(window.Plotly) draw(); });
  </script>
</body>
</html>
      `;

      const blob=new Blob([html],{type:"text/html"});
      this._frame.src=URL.createObjectURL(blob);
    }
  }

  customElements.define("variable-width-macc", VariableWidthMACC);

})();
