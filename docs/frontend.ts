interface Vec2 {
  x: number;
  y: number;
}

// ----------------------------------------------------------------------------
// Paint module:

/// 0-255 sRGBA
interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Outline {
  color: Color;
  width: number;
}

interface Clear {
  kind: "clear";
  fill_color: Color;
}

interface Line {
  kind: "line";
  color: Color;
  points: Vec2[];
  width: number;
}

interface Circle {
  kind: "circle";
  center: Vec2;
  fill_color: Color | null;
  outline: Outline | null;
  radius: number;
}

interface Rect {
  kind: "rect";
  corner_radius: number;
  fill_color: Color | null;
  outline: Outline | null;
  pos: Vec2;
  size: Vec2;
}

interface Text {
  kind: "text";
  fill_color: Color | null;
  font_name: string; // e.g. "Palatino"
  font_size: number; // Height in pixels, e.g. 12
  pos: Vec2;
  stroke_color: Color | null;
  text: string;
}

type PaintCmd = Circle | Clear | Line | Rect | Text;

// ----------------------------------------------------------------------------
// Canvas painting:

function style_from_color(color: Color): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255.0})`;
}

function paint_command(canvas, cmd: PaintCmd) {
  const ctx = canvas.getContext("2d");

  // console.log(`cmd: ${JSON.stringify(cmd)}`);

  switch (cmd.kind) {
    case "circle":
      ctx.beginPath();
      ctx.arc(cmd.center.x, cmd.center.y, cmd.radius, 0, 2 * Math.PI, false);
      if (cmd.fill_color) {
        ctx.fillStyle = style_from_color(cmd.fill_color);
        ctx.fill();
      }
      if (cmd.outline) {
        ctx.lineWidth = cmd.outline.width;
        ctx.strokeStyle = style_from_color(cmd.outline.color);
        ctx.stroke();
      }
      return;

    case "clear":
      ctx.fillStyle = style_from_color(cmd.fill_color);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;

    case "line":
      ctx.beginPath();
      ctx.moveTo(cmd.points[0].x, cmd.points[0].y);
      for (const point of cmd.points) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.lineWidth = cmd.width;
      ctx.strokeStyle = style_from_color(cmd.color);
      ctx.stroke();
      return;

    case "rect":
      const x = cmd.pos.x;
      const y = cmd.pos.y;
      const width = cmd.size.x;
      const height = cmd.size.y;
      const r = Math.min(cmd.corner_radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      if (cmd.fill_color) {
        ctx.fillStyle = style_from_color(cmd.fill_color);
        ctx.fill();
      }
      if (cmd.outline) {
        ctx.lineWidth = cmd.outline.width;
        ctx.strokeStyle = style_from_color(cmd.outline.color);
        ctx.stroke();
      }
      return;

    case "text":
      ctx.fillStyle = style_from_color(cmd.fill_color);
      ctx.font = `${cmd.font_size}px ${cmd.font_name}`;
      ctx.textBaseline = "middle";
      ctx.fillText(cmd.text, cmd.pos.x, cmd.pos.y);
      return;
  }
}

// ----------------------------------------------------------------------------

/// What the integration gives to the gui.
interface RawInput {
  /// Is the button currently down?
  mouse_down: boolean;

  /// Current position of the mouse in points.
  mouse_pos: Vec2;

  /// Size of the screen in points.
  screen_size: Vec2;
}

// ----------------------------------------------------------------------------

// the `wasm_bindgen` global is set to the exports of the Rust module. Override with wasm-bindgen --no-modules-global
declare var wasm_bindgen: any;

// we'll defer our execution until the wasm is ready to go
function wasm_loaded() {
  console.log(`wasm loaded`);
  initialize();
}

// here we tell bindgen the path to the wasm file so it can start
// initialization and return to us a promise when it's done
wasm_bindgen("./emgui_wasm_bg.wasm")
  .then(wasm_loaded)
  .catch(console.error);

function rust_gui(input: RawInput): PaintCmd[] {
  return JSON.parse(wasm_bindgen.show_gui(JSON.stringify(input)));
}

// ----------------------------------------------------------------------------

function js_gui(input: RawInput): PaintCmd[] {
  const commands = [];

  commands.push({
    fillStyle: "#111111",
    kind: "clear",
  });

  commands.push({
    fillStyle: "#ff1111",
    kind: "rect",
    pos: { x: 100, y: 100 },
    radius: 20,
    size: { x: 200, y: 100 },
  });

  return commands;
}

const WEB_GL = true;
let g_webgl_painter = null;

function paint_gui(canvas, input: RawInput) {
  if (WEB_GL) {
    if (g_webgl_painter === null) {
      g_webgl_painter = wasm_bindgen.new_webgl_painter("canvas");
    }
    wasm_bindgen.paint_webgl(g_webgl_painter, JSON.stringify(input));
  } else {
    let commands = rust_gui(input);
    for (const cmd of commands) {
      const commands = rust_gui(input);
      commands.unshift({
        fill_color: { r: 0, g: 0, b: 0, a: 0 },
        kind: "clear",
      });

      paint_command(canvas, cmd);
    }
  }
}

// ----------------------------------------------------------------------------

let g_mouse_pos = { x: -1000.0, y: -1000.0 };
let g_mouse_down = false;

function auto_resize_canvas(canvas) {
  if (WEB_GL) {
    canvas.setAttribute("width", window.innerWidth);
    canvas.setAttribute("height", window.innerHeight);
  } else {
    const pixels_per_point = window.devicePixelRatio || 1;

    const ctx = canvas.getContext("2d");
    ctx.scale(pixels_per_point, pixels_per_point);

    canvas.setAttribute("width", window.innerWidth * pixels_per_point);
    canvas.setAttribute("height", window.innerHeight * pixels_per_point);
  }
}

function get_input(canvas): RawInput {
  return {
    mouse_down: g_mouse_down,
    mouse_pos: g_mouse_pos,
    screen_size: { x: canvas.width, y: canvas.height },
  };
}

function mouse_pos_from_event(canvas, event): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function initialize() {
  console.log(`window.devicePixelRatio: ${window.devicePixelRatio}`);

  const canvas = document.getElementById("canvas");
  auto_resize_canvas(canvas);
  const repaint = () => paint_gui(canvas, get_input(canvas));

  canvas.addEventListener("mousemove", event => {
    g_mouse_pos = mouse_pos_from_event(canvas, event);
    repaint();
    event.stopPropagation();
    event.preventDefault();
  });

  canvas.addEventListener("mouseleave", event => {
    g_mouse_pos = { x: -1000.0, y: -1000.0 };
    repaint();
    event.stopPropagation();
    event.preventDefault();
  });

  canvas.addEventListener("mousedown", event => {
    g_mouse_pos = mouse_pos_from_event(canvas, event);
    g_mouse_down = true;
    repaint();
    event.stopPropagation();
    event.preventDefault();
  });

  canvas.addEventListener("mouseup", event => {
    g_mouse_pos = mouse_pos_from_event(canvas, event);
    g_mouse_down = false;
    repaint();
    event.stopPropagation();
    event.preventDefault();
  });

  window.addEventListener("load", repaint);
  window.addEventListener("pagehide", repaint);
  window.addEventListener("pageshow", repaint);
  window.addEventListener("resize", repaint);

  // setInterval(repaint, 16);

  repaint();
}
