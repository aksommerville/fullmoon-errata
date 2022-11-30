"use strict";

let decal = null; // null or {x,y,w,h} in outer-view.
let bgColor = [128, 128, 128]; // must match defaults in HTML
let animationTimeout = null;
let animationFrames = []; // array of [x,y,t]
let animationFramep = 0; // index of frame currently displayed

function renderOuterView() {
  const image = document.getElementById("source");
  const canvas = document.getElementById("outer-view");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
}

function renderDigestView() {
  const canvas = document.getElementById("digested-view");
  if (decal) {
    canvas.width = decal.w;
    canvas.height = decal.h;
  }
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = `rgb(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (decal) {
    const image = document.getElementById("outer-view");
    let srcx = decal.x;
    let srcy = decal.y;
    if (animationFramep < animationFrames.length) {
      const f = animationFrames[animationFramep];
      const sharedBorders = true ? -1 : 0; // true if adjacent frames have just one pixel between them.
      srcx += f[0] * (decal.w + sharedBorders);
      srcy += f[1] * (decal.h + sharedBorders);
    }
    ctx.drawImage(image, srcx, srcy, decal.w, decal.h, 0, 0, canvas.width, canvas.height);
  }
}

function resetDigestParameters() {
  // meh
}

function setDecalArea(r) {
  decal = r;
  resetDigestParameters();
  renderDigestView();
}

// (stride) in pixels not bytes.
// We say "opaque", but it's sourced from a fully opaque image, so really full-white pixels are "transparent".
function pixelIsOpaque(v, stride, x, y) {
  let p = (y * stride + x) * 4;
  if (p >= v.length) return false;

  /* white=transparent
  if (v[p++] !== 0xff) return true;
  if (v[p++] !== 0xff) return true;
  if (v[p++] !== 0xff) return true;
  return false;
  /**/

  /* alpha channel */
  if (v[p + 3]) return true;
  return false;
}

function findOpaquePixelInBorder(v, stride, left, top, right, bottom, w, h) {
  for (let x=left; x<=right; x++) {
    if (top >= 0) {
      if (pixelIsOpaque(v, stride, x, top)) return [x, top];
    }
    if (bottom < h) {
      if (pixelIsOpaque(v, stride, x, bottom)) return [x, bottom];
    }
  }
  for (let y=top; y<=bottom; y++) {
    if (left >= 0) {
      if (pixelIsOpaque(v, stride, left, y)) return [left, y];
    }
    if (right < w) {
      if (pixelIsOpaque(v, stride, right, y)) return [right, y];
    }
  }
  return null;
}

function rectContainsOpaquePixel(v, stride, x, y, w, h) {
  for (; h-->0; y++) {
    for (let xi=w; xi-->0; ) {
      if (pixelIsOpaque(v, stride, x + xi, y)) return true;
    }
  }
  return false;
}

/* From the pixel the user clicked on, expand outward until we find a fully white border.
 * Returns null or {x,y,w,h} in canvas coords.
 */
function findDecalInCanvas(canvas, x, y) {
  if (!canvas) return null;
  if ((x < 0) || (x >= canvas.width)) return null;
  if ((y < 0) || (y >= canvas.height)) return null;
  const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  if (!imageData) return null;
  const v = imageData.data;

  // If the indicated pixel is white, expand until we find something non-white, then restart the process from there.
  if (!pixelIsOpaque(v, imageData.width, x, y)) {
    let radius = 1;
    while ((x >= radius) || (y >= radius) || (x + radius < canvas.width) || (y + radius < canvas.height)) {
      const newAnchor = findOpaquePixelInBorder(v, imageData.width, x - radius, y - radius, x + radius, y + radius, canvas.width, canvas.height);
      if (newAnchor) return findDecalInCanvas(canvas, newAnchor[0], newAnchor[1]);
      radius++;
    }
    return null;
  }

  // Expand a frame around the image until its border is entirely transparent.
  let left = x - 1, right = x + 1, top = y - 1, bottom = y + 1;
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (right >= canvas.width) right = canvas.width - 1;
  if (bottom >= canvas.height) bottom = canvas.height - 1;
  while (1) {
    if (left && rectContainsOpaquePixel(v, imageData.width, left, top, 1, bottom - top + 1)) {
      left--;
      continue;
    }
    if (top && rectContainsOpaquePixel(v, imageData.width, left, top, right - left + 1, 1)) {
      top--;
      continue;
    }
    if ((right < canvas.width - 1) && rectContainsOpaquePixel(v, imageData.width, right, top, 1, bottom - top + 1)) {
      right++;
      continue;
    }
    if ((bottom < canvas.height - 1) && rectContainsOpaquePixel(v, imageData.width, left, bottom, right - left + 1, 1)) {
      bottom++;
      continue;
    }
    break;
  }
  
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

function clickInOuterView(event) {
  const canvas = document.getElementById("outer-view");
  const x = Math.round(event.offsetX);
  const y = Math.round(event.offsetY);
  const decal = findDecalInCanvas(canvas, x, y);
  if (!decal) return;
  setDecalArea(decal);
}

function updateBgColorTattle() {
  const tattle = document.getElementById('bg-color-tattle');
  if (!tattle) return;
  tattle.innerText = `#${bgColor.map(v=>v.toString(16).padStart(2,'0')).join("")}`;
}

function animationsEquivalent(a, b) {
  if (a === b) return true;
  if (!a) a = [];
  if (!b) b = [];
  if (a.length !== b.length) return false;
  for (let i=a.length; i-->0; ) {
    const aunit = a[i];
    const bunit = b[i];
    if (aunit[0] !== bunit[0]) return false;
    if (aunit[1] !== bunit[1]) return false;
    if (aunit[2] !== bunit[2]) return false;
  }
  return true;
}

function animateNextFrame() {
  animationTimeout = null;
  animationFramep++;
  if (animationFramep >= animationFrames.length) {
    animationFramep = 0;
  }
  renderDigestView();
  if (animationFramep < animationFrames.length) { // in case animationFrames got reset to empty behind our back
    animationTimeout = window.setTimeout(animateNextFrame, animationFrames[animationFramep][2]);
  }
}

// (frames) is an array of [x,y,t]
function applyAnimation(frames) {
  if (animationsEquivalent(frames, animationFrames)) return;
  if (animationTimeout) {
    window.clearTimeout(animationTimeout);
    animationTimeout = null;
  }
  animationFrames = frames;
  animationFramep = 0;
  renderDigestView();
  if (frames && (frames.length > 1)) {
    animationTimeout = window.setTimeout(animateNextFrame, frames[0][2]);
  }
}

function animationIsValid() {
  const element = document.querySelector("*[name='animation']");
  element.classList.remove("invalid");
  element.classList.add("valid");
}

function animationIsInvalid() {
  const element = document.querySelector("*[name='animation']");
  element.classList.add("invalid");
  element.classList.remove("valid");
}

function parseAndApplyAnimation(src) {
  try {
    const parsed = [];
    const unitRe = /\( *(\d+) *, *(\d+) *, *(\d+) *\)/g;
    for (const match of src.matchAll(unitRe)) {
      let x = +match[1];
      let y = +match[2];
      let t = +match[3];
      if (t < 10) t = 10;
      parsed.push([x, y, t]);
    }
    applyAnimation(parsed);
    animationIsValid();
  } catch (e) {
    console.log(e);
    animationIsInvalid();
  }
}

function onInput(event) {
  if (!event.target) return;
  switch (event.target.name) {
    case "bgr": bgColor[0] = +event.target.value; renderDigestView(); updateBgColorTattle(); return;
    case "bgg": bgColor[1] = +event.target.value; renderDigestView(); updateBgColorTattle(); return;
    case "bgb": bgColor[2] = +event.target.value; renderDigestView(); updateBgColorTattle(); return;
    case "animation": parseAndApplyAnimation(event.target.value); return;
  }
}

window.addEventListener("load", () => {
  renderOuterView();
  renderDigestView();
  document.body.addEventListener("input", (event) => onInput(event));
});
