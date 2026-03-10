(function () {

  // ---------------- Build Shadow DOM template without literal <style>/<div> ----------------
  const template = document.createElement("template");
  (function buildTemplate(){
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host { display:block; width:100%; height:100%; }
      #macc-container {
        width:100%; height:100%; position:relative;
        pointer-events:auto !important;
        z-index: 3;
      }
      #macc-container, #macc-container * { pointer-events:auto !important; }
      #macc-container .hoverlayer,
      #macc-container .layer-above,
      #macc-container .draglayer { pointer-events:auto !important; }
      #macc-container .modebar {
        right: 6px !important; left:auto !important; top:6px !important;
      }
    `;
    const rootEl = document.createElement("div");
    rootEl.id = "macc-container";
    template.content.appendChild(styleEl);
    template.content.appendChild(rootEl);
  })();

  // ---------- helpers ----------
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const macBinColor = v=>{
    if(v<0) return "rgba(39,174,96,0.95)";
    if(v<25) return "rgba(241,196,15,0.95)";
    if(v<50) return "rgba(230,126,34,0.95)";
    return "rgba(231,76,60,0.95)";
  };

  const LT=String.fromCharCode(60), GT=String.fromCharCode(62);
  const BR = LT+"br"+GT;
  const EXTRA = LT+"extra"+GT+LT+"/extra"+GT;

  function ensurePlotly() {
    if(window.Plotly && window.Plotly.newPlot) return Promise.resolve();
    if(window.__maccPlotlyLoading) return window.__maccPlotlyLoading;
    window.__maccPlotlyLoading=new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdn.plot.ly/plotly-2.27.0.min.js";
      s.async=true;
      s.onload=()=>res();
      s.onerror=e=>rej(e);
      document.head.appendChild(s);
    });
    return window.__maccPlotlyLoading;
  }

  class VariableWidthMACC extends HTMLElement {
    constructor(){
      super();

      this._shadow=this.attachShadow({mode:"open"});
      this._shadow.appendChild(template.content.cloneNode(true));
      this._container=this._shadow.querySelector("#macc-container");

      this._initialized=false;
      this._plotted=false;
      this._graphDiv=null;

      this._data={ project:[], abatement:[], mac:[] };

      this._style={
        widthCap:10,
        minWidth:0.2,
        xPadding:5,
        fontSize:12,
        colorMode:"gradient"
      };

      // FIXED for your model:
      // SAC does not provide metadata dimension id; we use feed id "dimension"
      this._dimTechId="dimension";

      this._onResizeObs=this._onResizeObs.bind(this);
      this._ro=new (window.ResizeObserver||class{observe(){}disconnect(){}})(this._onResizeObs);

      ensurePlotly().then(()=>{
        this._initialized=true;
        if(this._container.isConnected) this._ro.observe(this._container);
        this._render();
      }).catch(e=>{
        console.error("Plotly load error",e);
        this._setEmpty("Plotly failed.");
      });
    }

    connectedCallback(){
      try{ if(this._initialized) this._ro.observe(this._container);}catch(_){}
    }
    disconnectedCallback(){
      try{ this._ro.disconnect(); }catch(_){}
    }

    getDataBindings(){
      return{
        maccBinding:{
          feeds:[
            {id:"dimension", type:"dimension"},
            {id:"measure_abate", type:"mainStructureMember"},
            {id:"measure_mac", type:"mainStructureMember"}
          ]
        }
      };
    }

    set widthCap(v){ this._style.widthCap=Number(v)||10; this._render(); }
    set minWidth(v){ this._style.minWidth=Number(v)||0.2; this._render(); }
    set xPadding(v){ this._style.xPadding=Number(v)||5; this._render(); }
    set fontSize(v){ this._style.fontSize=Number(v)||12; this._render(); }

    onCustomWidgetBeforeUpdate(p){ this._applyProps(p); }
    onCustomWidgetAfterUpdate(p){ this._applyProps(p); }

    _applyProps(props){
      if(!props) return;
      if("maccBinding" in props) this._ingest(props.maccBinding);
      ["widthCap","minWidth","xPadding","fontSize"].forEach(p=>{
        if(p in props) this[p]=props[p];
      });
    }

    onCustomWidgetResize(){
      if(this._initialized && this._plotted){
        try{ Plotly.Plots.resize(this._graphDiv||this._container); }catch(_){}
      }
    }
    _onResizeObs(){ this.onCustomWidgetResize(); }

    // ---------------- INGEST (YOUR MODEL FORMAT) ----------------
    _ingest(binding){
      try{
        const rows=binding?.data||binding?.rows||[];
        if(!Array.isArray(rows)||rows.length===0){
          this._setEmpty("No data."); return;
        }

        // Your dimension object has: Project_ID, Project_name, Category
        const proj=[], ab=[], mc=[];

        for(const r of rows){
          const dims = r.dimension_0 || r.dimensions_0 || r;

          const projectId   = dims.Project_ID;
          const projectName = dims.Project_name ?? projectId;
          const memberKey   = String(projectId); // LA RIGHT SIDE

          const av = r.measure_abate_0?.raw ?? r.measure_abate_0 ?? (r.measures?.[0]?.raw) ?? 0;
          const mv = r.measure_mac_0?.raw   ?? r.measure_mac_0   ?? (r.measures?.[1]?.raw) ?? 0;

          proj.push({label:String(projectName), key:memberKey});
          ab.push(Number(av)||0);
          mc.push(Number(mv)||0);
        }

        this._data.project   =proj;
        this._data.abatement =ab;
        this._data.mac       =mc;

        this._render();

      }catch(e){
        console.error("Ingest error",e);
        this._setEmpty("Ingest failure.");
      }
    }

    _setEmpty(msg){
      this._container.innerHTML="";
      const d=document.createElement("div");
      d.style.font="12px Arial";
      d.style.color="#666";
      d.style.padding="8px";
      d.textContent=msg;
      this._container.appendChild(d);
      this._plotted=false;
      this._graphDiv=null;
    }

    // ---------------- RENDER ----------------
    _render(){
      if(!this._initialized) return;

      const P=this._data.project;
      const A=this._data.abatement;
      const M=this._data.mac;

      if(P.length===0){ this._setEmpty("No data."); return; }

      let rows=[];
      for(let i=0;i<P.length;i++)
        rows.push({Project:P[i], Abate:+A[i]||0, MAC:+M[i]||0});
      rows.sort((a,b)=>a.MAC-b.MAC);

      const total=rows.reduce((s,r)=>s+r.Abate,0);
      if(total<=0){ this._setEmpty("No abatement."); return; }

      const capPct=clamp(this._style.widthCap,1,50)/100;
      const minPct=clamp(this._style.minWidth,0.05,5)/100;
      const padPct=clamp(this._style.xPadding,0,20)/100;
      const fsize =clamp(this._style.fontSize,8,24);

      const capLim=total*capPct;
      const minLim=total*minPct;
      rows=rows.map(r=>({...r,AbateShown:clamp(r.Abate,minLim,capLim)}));

      const pxMin=18;
      const widthPx=Math.max(1,this._container.clientWidth||1);
      const pxToDom=total/widthPx;
      rows=rows.map(r=>({...r,AbateShown:Math.max(r.AbateShown,pxMin*pxToDom)}));

      let cum=0;
      rows=rows.map(r=>{
        const xs=cum, xe=cum+r.AbateShown; cum=xe;
        return {...r,x_mid:(xs+xe)/2};
      });

      const y=rows.map(r=>r.MAC);
      const x=rows.map(r=>r.x_mid);
      const w=rows.map(r=>r.AbateShown);
      const colors=rows.map(r=>macBinColor(r.MAC));

      let selectedKeys=new Set();

      const barTrace={
        type:"bar",
        x,y,width:w,
        marker:{color:colors,line:{color:"rgba(0,0,0,0.9)",width:1.5}},
        customdata: rows.map(r=>[r.Project.label,r.Abate,r.Project.key]),
        hovertemplate:
          "Project: %{customdata[0]}"+BR+
          "MAC: %{y:.2f} EUR/tCO₂e"+BR+
          "Abatement: %{customdata[1]:,.0f} tCO₂e"+EXTRA
      };

      const maxCum=Math.max(...rows.map(r=>r.x_mid+r.AbateShown/2));
      const xPad=Math.max(pxMin*pxToDom*1.5,maxCum*padPct);
      const xRange=[-xPad,maxCum+xPad];

      const yMin=Math.min(...y,0)*1.25;
      const yMax=Math.max(...y,0)*1.25;

      const layout={
        margin:{t:50,l:80,r:40,b:60},
        hovermode:"closest",
        hoverdistance:10,
        spikedistance:-1,
        hoverlabel:{bgcolor:"white",font:{size:fsize}},
        xaxis:{title:"Total Abatement (tCO₂e)",range:xRange,tickformat:"~s",automargin:true},
        yaxis:{title:"MAC (EUR/tCO₂e)",zeroline:true,automargin:true},
        shapes:[
          {type:"line",x0:60000,x1:60000,y0:yMin,y1:yMax,line:{color:"black",width:3,dash:"dash"}},
          {type:"line",x0:xRange[0],x1:xRange[1],y0:50,y1:50,line:{color:"blue",width:3,dash:"dot"}}
        ],
        annotations:[
          {x:60000,y:yMax*0.95,text:"Target: 60k tCO₂e",showarrow:false,font:{size:fsize}},
          {x:xRange[1],y:50,text:"Carbon price: 50 EUR/tCO₂e",showarrow:false,xanchor:"right",font:{size:fsize}}
        ]
      };

      const config={
        displaylogo:false,
        responsive:true,
        staticPlot:false,
        scrollZoom:false,
        doubleClick:"reset",
        displayModeBar:true,
        editable:false
      };

      const first=!this._plotted;

      Plotly.newPlot(this._container,[barTrace],layout,config).then(gd=>{
        this._graphDiv=gd;
        this._plotted=true;

        requestAnimationFrame(()=>{ try{Plotly.Plots.resize(gd);}catch(_){}});

        if(first){
          gd.on("plotly_click",ev=>{
            const p=ev?.points?.[0]; if(!p) return;
            const memberKey=p.customdata?.[2];

            if(!memberKey){console.warn("Missing key");return;}

            const multi=!!(ev.event&&(ev.event.ctrlKey||ev.event.metaKey||ev.event.shiftKey));
            if(multi){
              if(selectedKeys.has(memberKey)) selectedKeys.delete(memberKey);
              else selectedKeys.add(memberKey);
            } else {
              selectedKeys.clear(); selectedKeys.add(memberKey);
            }

            Plotly.restyle(gd,{
              "marker.line.width":[rows.map(r=>selectedKeys.has(r.Project.key)?3:1.5)],
              "marker.opacity":[rows.map(r=>selectedKeys.size===0?1:(selectedKeys.has(r.Project.key)?1:0.35))]
            });

            try{
              const db=this.dataBindings.getDataBinding?.();
              const la=db?.getLinkedAnalysis?.();
              if(!la) return;

              const enabled=la.isDataPointSelectionEnabled?.();
              if(!enabled){
                console.warn("LA: Filter on data point selection is OFF");
                return;
              }

              // YOUR MODEL: LEFT SIDE = "dimension", RIGHT SIDE = Project_ID
              const selections=[...selectedKeys].map(k=>({[this._dimTechId]:String(k)}));

              la.setFilters(selections);

            }catch(e){ console.error("LA error",e); }
          });

          gd.on("plotly_doubleclick",()=>{
            if(selectedKeys.size===0) return;
            selectedKeys.clear();

            Plotly.restyle(gd,{
              "marker.line.width":[rows.map(_=>1.5)],
              "marker.opacity":[rows.map(_=>1)]
            });

            try{
              const db=this.dataBindings.getDataBinding?.();
              db?.getLinkedAnalysis?.().removeFilters?.();
            }catch(e){}
          });
        } else {
          Plotly.react(gd,[barTrace],layout,config);
        }

      }).catch(e=>{
        console.error("Plot error",e);
        this._setEmpty("Plot error.");
      });

    }
  }

  if(!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc",VariableWidthMACC);

})();
