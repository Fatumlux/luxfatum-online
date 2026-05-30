import { useCallback, useEffect, useRef, useState } from "react";
import { CHARACTERS, cardImage } from "../data/characters";
import type { CharacterCard } from "../types";
import type { Application, Container, Graphics, Sprite, Text, TextStyleOptions } from "pixi.js";

type Props = {
  onFinish: () => void;
};

type TrailerCard = {
  character: CharacterCard;
  root: Container;
  frame: Graphics;
  mask: Graphics;
  image: Sprite;
  name: Text;
  stats: Text;
  badges: Text[];
};

type OpeningAudio = {
  start: () => void;
  tick: (time: number) => void;
  stop: () => void;
};

const DURATION = 32;
const ENTER_FROM = 27.5;
const UI_FONT = "\"Noto Sans TC\", \"Microsoft JhengHei UI\", \"Microsoft JhengHei\", \"PingFang TC\", \"Segoe UI\", sans-serif";
const FEATURED_IDS = ["ningyao", "kelu", "liewu", "baijian", "leiting", "songya"];
const STATUS_WORDS = ["封印", "混亂", "觀測", "守護"];

const CAPTIONS = [
  { start: 0, end: 5, text: "在規則被寫下之前，裁定已經存在。" },
  { start: 5, end: 10, text: "每一次選擇，都會留下痕跡。" },
  { start: 10, end: 17, text: "攻擊、守護、封印、混亂。勝負不只由傷害決定。" },
  { start: 17, end: 24, text: "當三人小隊踏入裁定場，命運開始結算。" },
  { start: 24, end: 32, text: "本次裁定，即將開始。" }
];

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function progress(time: number, start: number, end: number) {
  return clamp((time - start) / (end - start));
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - clamp(t), 3);
}

function easeInOut(t: number) {
  const n = clamp(t);
  return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
}

function currentCaption(time: number) {
  return CAPTIONS.find(item => time >= item.start && time < item.end)?.text || CAPTIONS[CAPTIONS.length - 1].text;
}

function captionLines(text: string) {
  const sentenceParts = text.match(/[^。]+。?/g)?.map(part => part.trim()).filter(Boolean) ?? [text];
  return sentenceParts.length ? sentenceParts : [text];
}

function createOpeningAudio(): OpeningAudio | null {
  const AudioContextClass = window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  let ctx: AudioContext;
  try {
    ctx = new AudioContextClass();
  } catch {
    return null;
  }
  const master = ctx.createGain();
  const ambientGain = ctx.createGain();
  const lowDrone = ctx.createOscillator();
  const haloDrone = ctx.createOscillator();
  const haloGain = ctx.createGain();
  const fired = new Set<string>();

  master.gain.value = 0;
  ambientGain.gain.value = 0;
  haloGain.gain.value = 0;
  lowDrone.type = "sine";
  lowDrone.frequency.value = 54;
  haloDrone.type = "triangle";
  haloDrone.frequency.value = 176;
  lowDrone.connect(ambientGain);
  haloDrone.connect(haloGain);
  ambientGain.connect(master);
  haloGain.connect(master);
  master.connect(ctx.destination);
  lowDrone.start();
  haloDrone.start();

  const safeRamp = (param: AudioParam, value: number, duration = 0.18) => {
    if (ctx.state === "closed") return;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, duration);
  };

  const playTone = (freq: number, duration: number, gain = 0.12, type: OscillatorType = "sine", delay = 0, endFreq?: number) => {
    if (ctx.state === "closed") return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(24, endFreq), at + duration);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.025);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  };

  const playNoise = (duration: number, gain = 0.1, delay = 0, filterFreq = 1600) => {
    if (ctx.state === "closed") return;
    const at = ctx.currentTime + delay;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sampleCount, 1.6);
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(filterFreq, at);
    amp.gain.setValueAtTime(gain, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(at);
  };

  const chime = (base: number, gain = 0.09) => {
    playTone(base, 0.52, gain, "sine");
    playTone(base * 1.5, 0.46, gain * 0.7, "triangle", 0.05);
    playTone(base * 2, 0.36, gain * 0.46, "sine", 0.12);
  };

  const hit = () => {
    playTone(86, 0.62, 0.18, "sine", 0, 34);
    playNoise(0.32, 0.12, 0, 700);
    playTone(240, 0.18, 0.08, "square", 0.03, 90);
  };

  const trigger = (id: string, time: number, fn: () => void) => {
    if (fired.has(id) || ctx.state === "closed") return;
    fired.add(id);
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    window.setTimeout(fn, Math.max(0, time * 1000));
  };

  return {
    start: () => {
      if (ctx.state === "closed") return;
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      safeRamp(master.gain, 0.22, 0.22);
      safeRamp(ambientGain.gain, 0.2, 0.4);
      safeRamp(haloGain.gain, 0.012, 0.4);
    },
    tick: time => {
      if (ctx.state === "closed") return;
      if (ctx.state === "running") {
        const now = ctx.currentTime;
        lowDrone.frequency.setTargetAtTime(50 + Math.sin(time * 0.45) * 5, now, 0.2);
        haloDrone.frequency.setTargetAtTime(158 + Math.sin(time * 0.32) * 18, now, 0.25);
      }
      trigger("wake", 0, () => chime(392, 0.055));
      trigger("particle-glint", 2.6, () => chime(523, 0.045));
      trigger("geometry-open", 5.1, () => {
        chime(440, 0.085);
        playNoise(0.42, 0.055, 0.05, 2600);
      });
      trigger("card-flash-1", 10.1, () => {
        playNoise(0.18, 0.08, 0, 2200);
        chime(659, 0.05);
      });
      trigger("card-flash-2", 13.4, () => playNoise(0.22, 0.075, 0, 2600));
      trigger("battle-cross", 17.1, () => {
        playNoise(0.4, 0.11, 0, 1200);
        playTone(180, 0.28, 0.08, "sawtooth", 0, 70);
      });
      trigger("judgement", 21.2, hit);
      trigger("finale-ring", 24.2, () => {
        chime(330, 0.11);
        playTone(132, 1.6, 0.11, "sine", 0.02, 88);
      });
      trigger("enter-ready", 27.6, () => chime(587, 0.08));
    },
    stop: () => {
      if (ctx.state === "closed") return;
      safeRamp(master.gain, 0.0001, 0.08);
      window.setTimeout(() => {
        try {
          lowDrone.stop();
          haloDrone.stop();
          void ctx.close();
        } catch {
          // The audio context may already be closed by browser lifecycle.
        }
      }, 520);
    }
  };
}

function makeFeatured() {
  return FEATURED_IDS
    .map(id => CHARACTERS.find(character => character.id === id))
    .filter(Boolean) as CharacterCard[];
}

export function OpeningTrailer({ onFinish }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<OpeningAudio | null>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const lastCaptionRef = useRef("");
  const lastCanEnterRef = useRef(false);
  const [caption, setCaption] = useState(CAPTIONS[0].text);
  const [canEnter, setCanEnter] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [pixiFailed, setPixiFailed] = useState(false);

  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    audioRef.current?.stop();
    audioRef.current = null;
    setExiting(true);
    window.setTimeout(() => onFinishRef.current(), 560);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let app: Application | null = null;
    let removeResize = () => undefined as void;
    const featured = makeFeatured();
    const audio = createOpeningAudio();
    audioRef.current = audio;
    audio?.start();
    const unlockAudio = () => audio?.start();
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    const run = async () => {
      try {
        const PIXI = await import("pixi.js");
        if (cancelled || !hostRef.current) return;

        app = new PIXI.Application();
        await app.init({
          resizeTo: hostRef.current,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(2, window.devicePixelRatio || 1)
        });
        if (cancelled || !hostRef.current) {
          app.destroy(true);
          return;
        }

        hostRef.current.appendChild(app.canvas);

        const stage = app.stage;
        const scene = new PIXI.Container();
        const bg = new PIXI.Graphics();
        const particles = new PIXI.Container();
        const shards = new PIXI.Container();
        const geometry = new PIXI.Graphics();
        const cardLayer = new PIXI.Container();
        const fx = new PIXI.Graphics();
        const logoLayer = new PIXI.Container();
        stage.addChild(scene);
        scene.addChild(bg, particles, shards, geometry, cardLayer, fx, logoLayer);

        const makeText = (text: string, size: number, fill = 0xfff8e8, weight: TextStyleOptions["fontWeight"] = "900") => {
          const node = new PIXI.Text({
            text,
            style: {
              fontFamily: UI_FONT,
              fontSize: size,
              fontWeight: weight,
              fill,
              align: "center",
              letterSpacing: 0,
              wordWrap: false,
              breakWords: false,
              stroke: { color: 0x05060a, width: Math.max(2, Math.round(size / 9)) }
            }
          });
          node.anchor.set(0.5);
          node.resolution = Math.max(2, window.devicePixelRatio || 1);
          return node;
        };

        const logo = makeText("LuxFatum：裁定對決", 56, 0xfff0b8, "900");
        const subtitle = makeText("本次裁定，即將開始。", 21, 0xf6efe0, "800");
        logoLayer.addChild(logo, subtitle);

        const particleViews = Array.from({ length: 150 }, (_, index) => {
          const node = new PIXI.Graphics()
            .circle(0, 0, 1 + Math.random() * 2.6)
            .fill({ color: index % 5 === 0 ? 0xffffff : 0xffd36a, alpha: 1 });
          particles.addChild(node);
          return {
            node,
            x: Math.random(),
            y: Math.random(),
            drift: -0.45 + Math.random() * 0.9,
            speed: 0.025 + Math.random() * 0.09,
            phase: Math.random() * Math.PI * 2,
            depth: 0.45 + Math.random() * 0.8
          };
        });

        const shardViews = Array.from({ length: 24 }, (_, index) => {
          const node = new PIXI.Graphics();
          shards.addChild(node);
          return {
            node,
            x: Math.random(),
            y: Math.random(),
            size: 20 + Math.random() * 72,
            angle: Math.random() * Math.PI * 2,
            speed: 0.25 + Math.random() * 0.9,
            tint: index % 3 === 0 ? 0xfff0b8 : index % 3 === 1 ? 0x9fd0ff : 0xff91a0
          };
        });

        const textureList = await Promise.all(featured.map(character =>
          PIXI.Assets.load(cardImage(character.id)).catch(() => PIXI.Texture.WHITE)
        ));
        if (cancelled) return;

        const cards: TrailerCard[] = featured.map((character, index) => {
          const root = new PIXI.Container();
          const frame = new PIXI.Graphics();
          const mask = new PIXI.Graphics();
          const image = new PIXI.Sprite(textureList[index]);
          const name = makeText(character.name, 20, 0xfff8e8, "900");
          const stats = makeText(`HP ${character.hp}   ATK ${character.atk}   SPD ${character.spd}`, 12, 0xfff0b8, "800");
          const badges = STATUS_WORDS.map(word => makeText(word, 11, 0xf8efe1, "900"));
          image.anchor.set(0.5);
          image.mask = mask;
          root.addChild(frame, image, mask, name, stats, ...badges);
          cardLayer.addChild(root);
          return { character, root, frame, mask, image, name, stats, badges };
        });

        function drawCard(card: TrailerCard, width: number, height: number, accent: number) {
          const headerH = 34;
          const footerH = 58;
          const artH = height - headerH - footerH;
          card.frame.clear()
            .roundRect(-width / 2, -height / 2, width, height, 9)
            .fill({ color: 0x070910, alpha: 0.78 })
            .roundRect(-width / 2, -height / 2, width, height, 9)
            .stroke({ color: accent, alpha: 0.84, width: 1.5 })
            .roundRect(-width / 2 + 7, -height / 2 + headerH, width - 14, artH - 8, 6)
            .stroke({ color: 0xfff0b8, alpha: 0.12, width: 1 });

          card.mask.clear()
            .roundRect(-width / 2 + 8, -height / 2 + headerH + 1, width - 16, artH - 10, 6)
            .fill({ color: 0xffffff, alpha: 1 });

          const texture = card.image.texture;
          const sourceW = Math.max(1, texture.width || width);
          const sourceH = Math.max(1, texture.height || height);
          const scale = Math.min((width - 16) / sourceW, (artH - 12) / sourceH);
          card.image.scale.set(scale);
          card.image.x = 0;
          card.image.y = -height / 2 + headerH + artH / 2 - 3;

          card.name.x = 0;
          card.name.y = height / 2 - 42;
          card.stats.x = 0;
          card.stats.y = height / 2 - 20;
          const badgeStep = Math.min(42, Math.max(30, (width - 34) / Math.max(1, card.badges.length)));
          const badgeStart = -badgeStep * (card.badges.length - 1) / 2;
          card.badges.forEach((badge, index) => {
            const fitScale = Math.min(0.9, (badgeStep - 6) / Math.max(1, badge.width));
            badge.x = badgeStart + index * badgeStep;
            badge.y = -height / 2 + 18;
            badge.scale.set(fitScale);
          });
        }

        function drawBackground(time: number, width: number, height: number) {
          bg.clear()
            .rect(0, 0, width, height)
            .fill({ color: 0x020307, alpha: 1 })
            .circle(width * 0.5, height * 0.5, Math.max(width, height) * (0.18 + 0.04 * Math.sin(time * 0.5)))
            .fill({ color: 0x2d2444, alpha: 0.2 })
            .circle(width * 0.22, height * 0.65, width * 0.24)
            .fill({ color: 0x10223d, alpha: 0.16 })
            .circle(width * 0.78, height * 0.35, width * 0.2)
            .fill({ color: 0x452018, alpha: 0.14 });
        }

        function drawGeometry(time: number, width: number, height: number) {
          const open = progress(time, 5, 10);
          const battle = progress(time, 17, 24);
          const finale = progress(time, 24, 32);
          const strength = Math.max(easeOut(open) * (1 - progress(time, 10, 13) * 0.6), battle * 0.8, finale);
          const cx = width / 2;
          const cy = height / 2;
          const base = Math.min(width, height);
          geometry.clear();
          if (strength <= 0.01) return;
          for (let i = 0; i < 5; i++) {
            const r = base * (0.12 + i * 0.055) * (0.72 + strength * 0.44);
            geometry.circle(cx, cy, r).stroke({ color: i % 2 ? 0xffffff : 0xffd36a, alpha: strength * (0.22 - i * 0.018), width: i === 0 ? 2.2 : 1.2 });
          }
          const points = 12;
          for (let i = 0; i < points; i++) {
            const a = time * 0.22 + i * Math.PI * 2 / points;
            const inner = base * (0.12 + 0.03 * Math.sin(time + i));
            const outer = base * (0.28 + 0.04 * Math.cos(time * 0.7 + i));
            geometry
              .moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
              .lineTo(cx + Math.cos(a + 0.12) * outer, cy + Math.sin(a + 0.12) * outer)
              .stroke({ color: 0xfff0b8, alpha: strength * 0.18, width: 1.1 });
          }
        }

        function updateParticles(time: number, width: number, height: number) {
          const fade = clamp(time / 4);
          particleViews.forEach(item => {
            const y = ((item.y - time * item.speed) % 1 + 1) % 1;
            item.node.x = item.x * width + Math.sin(time * 0.45 + item.phase) * item.drift * 34;
            item.node.y = y * height;
            item.node.alpha = fade * item.depth * (0.38 + Math.sin(time * 2 + item.phase) * 0.2);
            item.node.scale.set(item.depth * (1 + Math.sin(time + item.phase) * 0.16));
          });
        }

        function updateShards(time: number, width: number, height: number) {
          const reveal = Math.max(progress(time, 5, 10) * (1 - progress(time, 10, 12)), progress(time, 24, 30) * 0.55);
          shardViews.forEach((item, index) => {
            const wobble = time * item.speed + index;
            const x = item.x * width + Math.cos(wobble) * 18;
            const y = item.y * height + Math.sin(wobble * 0.8) * 26;
            const w = item.size;
            const h = item.size * (0.38 + (index % 4) * 0.08);
            item.node.clear()
              .roundRect(-w / 2, -h / 2, w, h, 3)
              .fill({ color: 0x05070d, alpha: 0.48 * reveal })
              .roundRect(-w / 2, -h / 2, w, h, 3)
              .stroke({ color: item.tint, alpha: 0.34 * reveal, width: 1 });
            item.node.x = x;
            item.node.y = y;
            item.node.rotation = item.angle + time * 0.12 * (index % 2 ? 1 : -1);
            item.node.alpha = reveal;
          });
        }

        function updateCards(time: number, width: number, height: number) {
          const cardW = clamp(width * 0.115, 112, 154);
          const cardH = cardW * 1.56;
          const flash = progress(time, 10, 17);
          const battle = progress(time, 17, 24);
          const fadeOut = 1 - progress(time, 23.2, 25.2);
          cards.forEach((card, index) => {
            const p1 = index >= 3;
            const teamIndex = index % 3;
            const accent = p1 ? 0x5aa7ff : 0xff6c7a;
            drawCard(card, cardW, cardH, accent);

            const flashAlpha = flash > 0 && flash < 1 ? clamp(Math.sin((flash * 8.2 + index * 0.6) * Math.PI) * 0.9 + 0.2) : 0;
            const flashX = width * (0.18 + teamIndex * 0.22) + Math.sin(time * 2 + index) * 18;
            const flashY = height * (0.38 + Math.sin(time * 1.5 + index) * 0.09);
            const battleX = width * (0.25 + teamIndex * 0.25);
            const battleY = p1 ? height * 0.58 : height * 0.26;
            const mix = easeInOut(battle);

            card.root.x = flashX * (1 - mix) + battleX * mix;
            card.root.y = flashY * (1 - mix) + battleY * mix;
            card.root.rotation = (Math.sin(time * 1.1 + index) * 0.035) * (1 - mix);
            card.root.scale.set((0.76 + flashAlpha * 0.2) * (1 - mix) + 0.9 * mix);
            card.root.alpha = clamp(Math.max(flashAlpha * progress(time, 10, 11.2), battle) * fadeOut);
          });
        }

        function drawFx(time: number, width: number, height: number) {
          fx.clear();
          const battle = progress(time, 17, 24);
          const finale = progress(time, 24, 32);
          if (battle > 0 && battle < 1) {
            const pulse = 0.5 + Math.sin(time * 12) * 0.5;
            for (let i = 0; i < 3; i++) {
              const y1 = height * (0.68 + Math.sin(time + i) * 0.03);
              const y2 = height * (0.32 + Math.cos(time + i) * 0.03);
              const x1 = width * (0.26 + i * 0.23);
              const x2 = width * (0.72 - i * 0.22);
              fx.moveTo(x1, y1)
                .lineTo(x2, y2)
                .stroke({ color: i % 2 ? 0xfff0b8 : 0x9fd0ff, alpha: battle * (0.3 + pulse * 0.28), width: 4 });
            }
            fx.circle(width * 0.5, height * 0.5, Math.min(width, height) * (0.08 + pulse * 0.025))
              .stroke({ color: 0xfff0b8, alpha: battle * 0.7, width: 2 });
          }
          if (finale > 0) {
            const radius = Math.min(width, height) * (0.2 + easeOut(finale) * 0.08);
            fx.circle(width / 2, height / 2, radius)
              .stroke({ color: 0xfff0b8, alpha: finale * 0.75, width: 3 });
            fx.circle(width / 2, height / 2, radius * 0.72)
              .stroke({ color: 0xffffff, alpha: finale * 0.28, width: 1.4 });
          }
        }

        function updateLogo(time: number, width: number, height: number) {
          const finale = easeOut(progress(time, 24, 30));
          logoLayer.alpha = finale;
          logo.x = width / 2;
          logo.y = height * 0.43;
          logo.scale.set(0.82 + finale * 0.18);
          subtitle.x = width / 2;
          subtitle.y = height * 0.52;
          subtitle.alpha = progress(time, 26, 29);
        }

        const startedAt = performance.now();
        const update = () => {
          if (!app || finishedRef.current) return;
          const time = (performance.now() - startedAt) / 1000;
          const width = app.screen.width;
          const height = app.screen.height;
          const shake = progress(time, 18, 22) * (1 - progress(time, 22, 24));
          scene.x = Math.sin(time * 46) * shake * 4;
          scene.y = Math.cos(time * 38) * shake * 3;

          drawBackground(time, width, height);
          updateParticles(time, width, height);
          updateShards(time, width, height);
          drawGeometry(time, width, height);
          updateCards(time, width, height);
          drawFx(time, width, height);
          updateLogo(time, width, height);
          audio?.tick(time);

          const nextCaption = currentCaption(time);
          if (lastCaptionRef.current !== nextCaption) {
            lastCaptionRef.current = nextCaption;
            setCaption(nextCaption);
          }
          const nextCanEnter = time >= ENTER_FROM;
          if (lastCanEnterRef.current !== nextCanEnter) {
            lastCanEnterRef.current = nextCanEnter;
            setCanEnter(nextCanEnter);
          }
          if (time >= DURATION) finish();
        };

        app.ticker.add(update);
        update();
        removeResize = () => app?.ticker?.remove(update);
      } catch {
        if (!cancelled) {
          setPixiFailed(true);
          window.setTimeout(() => setCanEnter(true), 1200);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      removeResize();
      if (audioRef.current === audio) {
        audio.stop();
        audioRef.current = null;
      }
      if (app) {
        app.destroy(true, { children: true, texture: false, textureSource: false });
      }
    };
  }, [finish]);

  return (
    <section className={`opening-trailer ${exiting ? "exiting" : ""}`} aria-label="LuxFatum 前導動畫">
      <div ref={hostRef} className="opening-canvas" />
      <div className="opening-vignette" />
      <button type="button" className="opening-skip" onClick={finish}>Skip</button>
      <div className="opening-caption">
        <span>裁定序幕 / Opening Trailer</span>
        <p>{captionLines(pixiFailed ? "裁定場正在展開。" : caption).map((line, index) => (
          <span className="opening-caption-line" key={`${line}-${index}`}>{line}</span>
        ))}</p>
      </div>
      <div className="opening-enter-wrap">
        <button type="button" className={`opening-enter ${canEnter ? "ready" : ""}`} onClick={finish}>
          進入裁定
        </button>
      </div>
      <div className="opening-progress" />
    </section>
  );
}
