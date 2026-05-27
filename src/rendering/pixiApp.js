export async function createPixiStage(PIXI, root, onResize) {
  const app = new PIXI.Application();
  await app.init({
    resizeTo: root,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2)
  });

  app.canvas.className = "pixi-canvas";
  root.appendChild(app.canvas);

  const layers = {
    backgroundLayer: new PIXI.Container(),
    battleLayer: new PIXI.Container(),
    cardLayer: new PIXI.Container(),
    hudLayer: new PIXI.Container(),
    fxLayer: new PIXI.Container()
  };

  for (const [name, layer] of Object.entries(layers)) {
    layer.label = name;
    layer.name = name;
    app.stage.addChild(layer);
  }

  const resizeObserver = new ResizeObserver(() => {
    app.renderer.resize(root.clientWidth, root.clientHeight);
    if (typeof onResize === "function") {
      requestAnimationFrame(onResize);
    }
  });
  resizeObserver.observe(root);

  return {
    app,
    layers,
    destroy() {
      resizeObserver.disconnect();
      app.destroy(true, { children: true });
    }
  };
}
