/* Small SVG scene controller. Motion is decorative; execution state comes from the cockpit. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RadixNetworkScene=api;
})(typeof window==='object'?window:this,function(){
  'use strict';
  function orbitPoint(o,time){
    var angle=o.phase+time*o.speed,tilt=o.tilt*Math.PI/180;
    var x=Math.cos(angle)*o.rx,y=Math.sin(angle)*o.ry;
    var depth=Math.sin(angle);
    return {x:o.x+x*Math.cos(tilt)-y*Math.sin(tilt),y:o.y+x*Math.sin(tilt)+y*Math.cos(tilt),scale:.88+depth*.18,opacity:.67+depth*.22};
  }
  function beamPath(x,y,r,bend,px,py){
    var dx=x-450,dy=y-245,length=Math.max(1,Math.hypot(dx,dy)),ux=dx/length,uy=dy/length;
    var sx=450+ux*60,sy=245+uy*60,ex=x-ux*r,ey=y-uy*r;
    var offset=bend+px*28,drift=py*22;
    return 'M'+sx+' '+sy+' C'+(sx+dx*.35-uy*offset)+' '+(sy+dy*.12+ux*offset+drift)+' '+(ex-dx*.24-uy*offset)+' '+(ey-dy*.28+ux*offset+drift)+' '+ex+' '+ey;
  }
  function attach(svg,wrap){
    var nodes=[],beams=[],frame=0,time=0,last=0,visible=true,disposed=false;
    var target={x:0,y:0},pointer={x:0,y:0},drawn={x:NaN,y:NaN},reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    function collect(){
      nodes=Array.from(svg.querySelectorAll('[data-orbit-x]')).map(function(el){
        function n(key){return Number(el.getAttribute('data-orbit-'+key))}
        return {el:el,x:n('x'),y:n('y'),rx:n('rx'),ry:n('ry'),phase:n('phase'),tilt:n('tilt'),speed:n('speed'),time:time};
      });
      beams=Array.from(svg.querySelectorAll('[data-beam-x]')).map(function(el){return {el:el,x:Number(el.getAttribute('data-beam-x')),y:Number(el.getAttribute('data-beam-y')),r:Number(el.getAttribute('data-beam-radius')),bend:Number(el.getAttribute('data-beam-bend'))}});
      drawn.x=drawn.y=NaN;draw();schedule();
    }
    function draw(){
      nodes.forEach(function(o){
        if(o.el.matches(':hover, :focus-visible')||o.el.closest('.network-cluster.cluster-hover'))return;
        var p=orbitPoint(o,reduced.matches?0:o.time);
        o.el.setAttribute('transform','translate('+p.x+' '+p.y+') scale('+p.scale+')');
        o.el.style.opacity=p.opacity;
      });
      if(!Number.isFinite(drawn.x)||Math.abs(pointer.x-drawn.x)+Math.abs(pointer.y-drawn.y)>.0002){
        beams.forEach(function(b){b.el.setAttribute('d',beamPath(b.x,b.y,b.r,b.bend,pointer.x,pointer.y))});
        drawn.x=pointer.x;drawn.y=pointer.y;
      }
      svg.style.transform=reduced.matches?'':'translate('+(pointer.x*7)+'px,'+(pointer.y*5)+'px)';
    }
    function allowed(){return !disposed&&visible&&!document.hidden&&!reduced.matches&&!svg.closest('[hidden]')}
    function schedule(){if(!frame&&allowed())frame=requestAnimationFrame(tick)}
    function tick(stamp){
      frame=0;if(!allowed()){last=0;return}
      var dt=last?Math.min(.05,(stamp-last)/1000):0;last=stamp;time+=dt;
      nodes.forEach(function(o){if(!o.el.matches(':hover, :focus-visible')&&!o.el.closest('.network-cluster.cluster-hover'))o.time+=dt});
      pointer.x+=(target.x-pointer.x)*.08;pointer.y+=(target.y-pointer.y)*.08;
      draw();schedule();
    }
    function move(e){if(reduced.matches||wrap.classList.contains('is-dragging')||e.pointerType==='touch')return;var r=wrap.getBoundingClientRect();target.x=(e.clientX-r.left-r.width/2)/r.width;target.y=(e.clientY-r.top-r.height/2)/r.height;schedule()}
    function leave(){target.x=target.y=0}
    function preference(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;pointer.x=pointer.y=target.x=target.y=0;draw();schedule()}
    var observer=new MutationObserver(collect);observer.observe(svg,{childList:true});
    var visibility=typeof IntersectionObserver==='function'?new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;if(!visible){if(frame)cancelAnimationFrame(frame);frame=0;last=0}else schedule()}):null;
    if(visibility)visibility.observe(wrap);
    wrap.addEventListener('pointermove',move);wrap.addEventListener('pointerleave',leave);
    document.addEventListener('visibilitychange',preference);reduced.addEventListener('change',preference);
    collect();
    return {refresh:collect,destroy:function(){disposed=true;if(frame)cancelAnimationFrame(frame);observer.disconnect();if(visibility)visibility.disconnect();wrap.removeEventListener('pointermove',move);wrap.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',preference);reduced.removeEventListener('change',preference)}};
  }
  return {orbitPoint:orbitPoint,beamPath:beamPath,attach:attach};
});
