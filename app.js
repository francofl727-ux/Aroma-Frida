/* ======================= CONFIGURACIÓN ======================= */
// 1) Publicá tu Google Sheet compartido como "Cualquier persona con el enlace: Lector".
// 2) Copiá el ID de la hoja (está en la URL, entre /d/ y /edit) y pegalo abajo.
// 3) Las pestañas (hojas) deben llamarse "Productos" y "Ofertas" (ver README-ADMIN.md).
const CONFIG = {
  SHEET_ID: "1Con4IbPzoO9H_Y7lcZxqlG-S1G6nsdE5bg5nAfm1V3U",
  PRODUCTS_TAB: "Productos",
  OFFERS_TAB: "Ofertas",
  IMAGE_WIDTH: 640,          // resolución de imagen que se pide al CDN (evita fotos borrosas)
  ORDERS_WEBHOOK_URL: ""     // <-- PEGÁ ACÁ LA URL DE TU APPS SCRIPT (ver README-ADMIN.md) para guardar pedidos en el Sheets
};
/* =============================================================== */

const PHONE = "5491167540252";
const money = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);
const cart = new Map(); // key: "p-<id>" para productos, "o-<id>" para ofertas
let activeCategory = "Todos";
let searchTerm = "";
let products = [];
let offers = [];

const $ = s => document.querySelector(s);
const categoriesEl = $("#categories");
const productsEl = $("#products");
const offersSection = $("#offersSection");
const offersEl = $("#offers");
const destacadosSection = $("#destacadosSection");
const destacadosEl = $("#destacados");

/* ---------- Carga de datos desde Google Sheets (con respaldo local) ---------- */

function sheetTabUrl(tabName){
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
}

// Parsea la respuesta "gviz" de Google (viene envuelta en una función JS, no es JSON puro)
function parseGviz(text){
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if(!match) throw new Error("Respuesta inesperada de Google Sheets");
  const data = JSON.parse(match[1]);
  const cols = data.table.cols.map(c => (c.label || c.id || "").trim().toLowerCase());
  return (data.table.rows || []).map(row => {
    const obj = {};
    row.c.forEach((cell, i) => { obj[cols[i]] = cell ? (cell.v ?? "") : ""; });
    return obj;
  });
}

async function fetchTab(tabName){
  const res = await fetch(sheetTabUrl(tabName), { cache: "no-store" });
  if(!res.ok) throw new Error("No se pudo leer la hoja " + tabName);
  return parseGviz(await res.text());
}

function isActivo(v){
  if(v === "" || v === undefined || v === null) return true; // por defecto, activo
  const s = String(v).trim().toLowerCase();
  return !(s === "no" || s === "false" || s === "0" || s === "inactivo");
}

function isTrue(v){
  const s = String(v||"").trim().toLowerCase();
  return s==="si" || s==="sí" || s==="true" || s==="1" || s==="yes";
}

function normalizeProducts(rows){
  return rows
    .filter(r => r.nombre && String(r.nombre).trim() && isActivo(r.activo))
    .map((r, i) => ({
      id: r.id !== undefined && r.id !== "" ? Number(r.id) : i + 1,
      name: String(r.nombre).trim(),
      price: Number(r.precio) || 0,
      category: (r.categoria ? String(r.categoria).trim() : "Otros") || "Otros",
      image: r.imagen ? String(r.imagen).trim() : "",
      description: r.descripcion ? String(r.descripcion).trim() : "",
      featured: isTrue(r.destacado),
      fragancias: String(r.fragancias || "").split(",").map(s => s.trim()).filter(Boolean)
    }));
}

function normalizeOffers(rows){
  return rows
    .filter(r => r.nombre && String(r.nombre).trim() && isActivo(r.activo))
    .map((r, i) => ({
      id: r.id !== undefined && r.id !== "" ? Number(r.id) : i + 1,
      name: String(r.nombre).trim(),
      description: r.descripcion ? String(r.descripcion).trim() : "",
      price: Number(r.precio) || 0,
      productIds: String(r.productos_ids || "").split(",").map(s => s.trim()).filter(Boolean).map(Number),
      images: String(r.imagen || "").split(",").map(s => s.trim()).filter(Boolean)
    }));
}

async function loadCatalog(){
  // Sin Sheet configurado todavía: usamos el catálogo de respaldo incluido en el proyecto.
  if(!CONFIG.SHEET_ID){
    products = (window.CATALOG_FALLBACK || []).map((p,i)=>({...p,id:i+1,description:""}));
    offers = [];
    return;
  }
  try{
    const [prodRows, offerRows] = await Promise.all([
      fetchTab(CONFIG.PRODUCTS_TAB),
      fetchTab(CONFIG.OFFERS_TAB).catch(() => []) // si no existe la pestaña de ofertas, seguimos sin ella
    ]);
    const p = normalizeProducts(prodRows);
    products = p.length ? p : (window.CATALOG_FALLBACK || []).map((x,i)=>({...x,id:i+1,description:""}));
    offers = normalizeOffers(offerRows);
  }catch(err){
    console.error("Error cargando Google Sheets, uso catálogo de respaldo:", err);
    products = (window.CATALOG_FALLBACK || []).map((p,i)=>({...p,id:i+1,description:""}));
    offers = [];
  }
}

/* ---------- Imágenes: pide una resolución más alta al CDN para que no se vean borrosas ---------- */
function sharpen(url){
  if(!url) return url;
  // Las imágenes de Tiendanube/Nuvemshop terminan en "-<ancho>-<alto>.<ext>" (ej: -50-0.webp),
  // donde alto=0 significa "mantener proporción". Solo cambiamos el ancho y mantenemos el
  // mismo esquema (si no, el CDN no reconoce el tamaño pedido y la imagen no carga).
  const m = url.match(/^(.*-)(\d+)-(\d+)(\.\w+)$/);
  if(m) return `${m[1]}${CONFIG.IMAGE_WIDTH}-${m[3]}${m[4]}`;
  return url;
}

/* ---------- Render ---------- */

function renderCategories(){
  const counts = {};
  products.forEach(p => counts[p.category]=(counts[p.category]||0)+1);
  const known = ["Todos","Sahumerios","Sahumos y Defumación","Hornillos","Sahumadores","Cascadas y Conos","Porta Sahumerios","Velas y Portavelas","Lámparas y Sal","Kits y Boxes","Tarot y Oráculos","Pulseras y Accesorios","Atrapasueños y Decoración","Palo Santo","Aromatización","Limpieza","Antimosquitos","Otros"];
  const extra = Object.keys(counts).filter(c => !known.includes(c));
  const order = [...known, ...extra];
  const icons = {Todos:"✨",Sahumerios:"🔥","Sahumos y Defumación":"🌿",Hornillos:"🪔",Sahumadores:"🏺","Cascadas y Conos":"🌀","Porta Sahumerios":"🧿","Velas y Portavelas":"🕯️","Lámparas y Sal":"💎","Kits y Boxes":"🎁","Tarot y Oráculos":"🔮","Pulseras y Accesorios":"📿","Atrapasueños y Decoración":"🌈","Palo Santo":"🌿",Aromatización:"💧",Limpieza:"🧹",Antimosquitos:"🦟",Otros:"📦"};
  categoriesEl.innerHTML = order.filter(c => c==="Todos" || counts[c]).map(c => {
    const icon = icons[c] || "📦";
    return `<button class="cat ${activeCategory===c?"active":""}" data-cat="${escapeHtml(c)}">${icon} ${escapeHtml(c)}${c!=="Todos"?` · ${counts[c]}`:""}</button>`;
  }).join("");
  categoriesEl.querySelectorAll(".cat").forEach(b=>b.onclick=()=>{activeCategory=b.dataset.cat;renderCategories();renderProducts();});
}

function filtered(){
  return products.filter(p=>{
    const okCat = activeCategory==="Todos" || p.category===activeCategory;
    const hay = `${p.id} ${p.name} ${p.category}`.toLocaleLowerCase();
    return okCat && hay.includes(searchTerm);
  });
}

function renderProducts(){
  const list=filtered();
  $("#results").textContent=`${list.length} producto${list.length===1?"":"s"}`;
  if(!list.length){productsEl.innerHTML=`<div class="empty"><div style="font-size:36px">🔎</div><p>No encontramos productos con esa búsqueda.</p></div>`;return;}
  productsEl.innerHTML=list.map(card).join("");
  productsEl.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>add("p-"+b.dataset.add));
  productsEl.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>change("p-"+b.dataset.minus,-1));
  productsEl.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>change("p-"+b.dataset.plus,1));
  productsEl.querySelectorAll("[data-detail]").forEach(el=>el.onclick=()=>{
    const p = products.find(x=>x.id===Number(el.dataset.detail));
    if(p) openProductModal(p);
  });
}

function card(p){
  const hasFrag = p.fragancias && p.fragancias.length > 0;
  const q = hasFrag ? 0 : (cart.get("p-"+p.id)||0);
  const img = sharpen(p.image);
  return `<article class="card">
    <div class="card-image">
      <img loading="lazy" class="zoomable" data-images="${escapeAttr(img)}" data-idx="0" src="${escapeAttr(img)}" alt="${escapeAttr(p.name)}" onerror="this.style.opacity='.15'">
      <span class="badge">${p.featured?"⭐ ":""}${escapeHtml(p.category)}</span>
      <span class="badge id-badge">#${p.id}</span>
    </div>
    <div class="card-body" ${hasFrag?`data-detail="${p.id}"`:""}>
      <h3>${escapeHtml(p.name)}</h3>
      ${p.description ? `<p class="desc">${escapeHtml(p.description)}</p>` : ""}
      <div class="price">${money(p.price)}</div>
      <div class="card-actions">
        ${hasFrag
          ? `<button class="add">Elegir aroma</button>`
          : `${q ? `<div class="qty"><button data-minus="${p.id}">−</button><span>${q}</span><button data-plus="${p.id}">+</button></div>` : ""}<button class="add" data-add="${p.id}">${q?"Agregar otro":"Agregar al carrito"}</button>`
        }
      </div>
    </div>
  </article>`;
}

function renderDestacados(){
  if(searchTerm){ destacadosSection.style.display = "none"; return; }
  const list = products.filter(p=>p.featured);
  if(!list.length){ destacadosSection.style.display = "none"; return; }
  destacadosSection.style.display = "block";
  destacadosEl.innerHTML = list.map(card).join("");
  destacadosEl.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>add("p-"+b.dataset.add));
  destacadosEl.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>change("p-"+b.dataset.minus,-1));
  destacadosEl.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>change("p-"+b.dataset.plus,1));
  destacadosEl.querySelectorAll("[data-detail]").forEach(el=>el.onclick=()=>{
    const p = products.find(x=>x.id===Number(el.dataset.detail));
    if(p) openProductModal(p);
  });
}

function renderOffers(){
  if(searchTerm){ offersSection.style.display = "none"; return; }
  if(!offers.length){ offersSection.style.display = "none"; return; }
  offersSection.style.display = "block";
  offersEl.innerHTML = offers.map(offerCard).join("");
  offersEl.querySelectorAll("[data-add-offer]").forEach(b=>b.onclick=()=>add("o-"+b.dataset.addOffer));
  offersEl.querySelectorAll("[data-minus-offer]").forEach(b=>b.onclick=()=>change("o-"+b.dataset.minusOffer,-1));
  offersEl.querySelectorAll("[data-plus-offer]").forEach(b=>b.onclick=()=>change("o-"+b.dataset.plusOffer,1));
}

function offerCard(o){
  const q=cart.get("o-"+o.id)||0;
  const included = o.productIds.map(id => products.find(p=>p.id===id)).filter(Boolean);
  let images = o.images.map(sharpen);
  if(!images.length) images = included.map(p=>sharpen(p.image)).filter(Boolean);
  images = images.slice(0,4);
  const imgsAttr = escapeAttr(images.join("|"));
  const gallery = images.length>1
    ? `<div class="offer-gallery gallery-${images.length}">${images.map((src,i)=>`<img loading="lazy" class="zoomable" data-images="${imgsAttr}" data-idx="${i}" src="${escapeAttr(src)}" alt="${escapeAttr(o.name)}" onerror="this.style.opacity='.15'">`).join("")}</div>`
    : (images[0] ? `<img loading="lazy" class="zoomable" data-images="${imgsAttr}" data-idx="0" src="${escapeAttr(images[0])}" alt="${escapeAttr(o.name)}" onerror="this.style.opacity='.15'">` : "");
  return `<article class="card offer-card">
    <div class="card-image">
      ${gallery}
      <span class="badge offer-badge">Oferta</span>
      <span class="badge id-badge">#O${o.id}</span>
    </div>
    <div class="card-body">
      <h3>${escapeHtml(o.name)}</h3>
      ${o.description ? `<p class="desc">${escapeHtml(o.description)}</p>` : ""}
      ${included.length ? `<p class="offer-includes">Incluye: ${included.map(p=>escapeHtml(p.name)+` (#${p.id})`).join(" + ")}</p>` : ""}
      <div class="price">${money(o.price)}</div>
      <div class="card-actions">
        ${q ? `<div class="qty"><button data-minus-offer="${o.id}">−</button><span>${q}</span><button data-plus-offer="${o.id}">+</button></div>` : ""}
        <button class="add" data-add-offer="${o.id}">${q?"Agregar otra":"Agregar oferta"}</button>
      </div>
    </div>
  </article>`;
}

/* ---------- Carrito ---------- */
// getItem: devuelve {name, price, image} tanto si es producto (con o sin fragancia elegida) como si es oferta.
// Las keys de productos con fragancia elegida tienen la forma "p-<id>--<fragancia>".
function getItem(key){
  const [type, idStr] = key.split("-");
  const id = Number(idStr);
  if(type==="o") return offers.find(o=>o.id===id);
  const base = products.find(p=>p.id===id);
  if(!base) return null;
  const dashIdx = key.indexOf("--");
  if(dashIdx !== -1){
    const fragancia = key.slice(dashIdx+2);
    return { ...base, name: `${base.name} (${fragancia})` };
  }
  return base;
}

function add(key){cart.set(key,(cart.get(key)||0)+1);update();renderProducts();renderOffers();renderDestacados();renderCart();}
function change(key,delta){
  const next=(cart.get(key)||0)+delta;
  if(next<=0)cart.delete(key);else cart.set(key,next);
  update();renderProducts();renderOffers();renderDestacados();renderCart();
}
function update(){
  let count=0,total=0;
  cart.forEach((q,key)=>{count+=q;const item=getItem(key);if(item){total+=item.price*q;}});
  $("#cartCount").textContent=count;$("#floatingCount").textContent=count;$("#cartTotal").textContent=money(total);
  $("#productModalCartCount").textContent=count;
  $("#productModalCartTotal").textContent=money(total);
}
function renderCart(){
  if(!cart.size){$("#cartItems").innerHTML=`<div class="empty"><div style="font-size:40px">🛍️</div><p>Tu carrito está vacío.</p><p>Elegí productos del catálogo para armar tu pedido.</p></div>`;return;}
  $("#cartItems").innerHTML=[...cart.entries()].map(([key,q])=>{
    const item=getItem(key);
    if(!item) return "";
    const isOffer = key.startsWith("o-");
    const thumb = isOffer ? (item.images && item.images[0]) : item.image;
    const idLabel = isOffer ? `#O${item.id}` : `#${item.id}`;
    return `<div class="cart-item">
      <img src="${escapeAttr(sharpen(thumb))}" alt="">
      <div><h4>${idLabel} · ${escapeHtml(item.name)}${isOffer?" (oferta)":""}</h4><small>${money(item.price)} c/u</small>
      <div class="cart-controls"><button data-cart-minus="${key}">−</button><span>${q}</span><button data-cart-plus="${key}">+</button></div></div>
      <div class="item-total">${money(item.price*q)}</div>
    </div>`;
  }).join("");
  $("#cartItems").querySelectorAll("[data-cart-minus]").forEach(b=>b.onclick=()=>change(b.dataset.cartMinus,-1));
  $("#cartItems").querySelectorAll("[data-cart-plus]").forEach(b=>b.onclick=()=>change(b.dataset.cartPlus,1));
}

function openCart(){$("#overlay").classList.add("open");$("#cartDrawer").classList.add("open")}
function closeCart(){$("#overlay").classList.remove("open");$("#cartDrawer").classList.remove("open")}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function escapeAttr(s){return escapeHtml(s)}

/* ---------- Zoom de imágenes (lightbox) ---------- */
let lightboxImages = [];
let lightboxIndex = 0;

function openLightbox(images, idx){
  lightboxImages = images;
  lightboxIndex = idx;
  showLightboxImage();
  $("#lightbox").classList.add("open");
  history.pushState({ lightbox: true }, "");
}
function showLightboxImage(){
  const imgEl = $("#lightboxImg");
  imgEl.src = lightboxImages[lightboxIndex] || "";
  imgEl.classList.remove("lightbox-anim");
  void imgEl.offsetWidth; // fuerza reflow para poder repetir la animación
  imgEl.classList.add("lightbox-anim");
  const multi = lightboxImages.length > 1;
  $("#lightboxPrev").style.display = multi ? "flex" : "none";
  $("#lightboxNext").style.display = multi ? "flex" : "none";
  $("#lightboxCount").textContent = multi ? `${lightboxIndex+1} / ${lightboxImages.length}` : "";
}
function closeLightbox(){
  // Si la foto se abrió empujando un estado al historial, "cerrar" es volver atrás:
  // así el botón físico de atrás del celular solo cierra la foto, no sale de la página.
  if(history.state && history.state.lightbox){
    history.back();
  } else {
    $("#lightbox").classList.remove("open");
  }
}
function lightboxStep(delta){
  lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
  showLightboxImage();
}
document.addEventListener("click", e=>{
  const img = e.target.closest(".zoomable");
  if(img){
    const imgs = (img.dataset.images||"").split("|").filter(Boolean);
    if(imgs.length) openLightbox(imgs, Number(img.dataset.idx||0));
    return;
  }
  if(e.target.closest("#lightboxClose") || e.target.id==="lightbox") closeLightbox();
  if(e.target.closest("#lightboxPrev")) lightboxStep(-1);
  if(e.target.closest("#lightboxNext")) lightboxStep(1);
});
document.addEventListener("keydown", e=>{
  if(!$("#lightbox").classList.contains("open")) return;
  if(e.key==="Escape") closeLightbox();
  if(e.key==="ArrowLeft") lightboxStep(-1);
  if(e.key==="ArrowRight") lightboxStep(1);
});
// El botón físico de "atrás" del celular dispara esto: cerramos la foto en vez de salir de la página.
window.addEventListener("popstate", ()=>{
  $("#lightbox").classList.remove("open");
  $("#productModal").classList.remove("open");
});

/* ---------- Vista de detalle de producto (elegir fragancia/aroma) ---------- */
let modalProduct = null;
let modalFragancia = null;

function openProductModal(p){
  modalProduct = p;
  modalFragancia = (p.fragancias && p.fragancias[0]) || null;
  renderProductModal();
  $("#productModal").classList.add("open");
  history.pushState({ productModal: true }, "");
}
function closeProductModal(){
  if(history.state && history.state.productModal){
    history.back();
  } else {
    $("#productModal").classList.remove("open");
  }
}
function renderProductModal(){
  const p = modalProduct;
  if(!p) return;
  const img = sharpen(p.image);
  const imgEl = $("#productModalImg");
  imgEl.src = img;
  imgEl.dataset.images = img;
  $("#productModalName").textContent = p.name;
  $("#productModalDesc").textContent = p.description || "";
  $("#productModalDesc").style.display = p.description ? "block" : "none";
  $("#productModalPrice").textContent = money(p.price);
  const fragEl = $("#productModalFragancias");
  if(p.fragancias && p.fragancias.length){
    fragEl.style.display = "block";
    fragEl.innerHTML = `<div class="frag-label">Elegí una fragancia:</div><div class="frag-chips">${p.fragancias.map(f=>
      `<button class="frag-chip ${f===modalFragancia?"active":""}" data-frag="${escapeAttr(f)}">${escapeHtml(f)}</button>`
    ).join("")}</div>`;
    fragEl.querySelectorAll("[data-frag]").forEach(b=>{
      b.onclick = ()=>{ modalFragancia = b.dataset.frag; renderProductModal(); };
    });
  } else {
    fragEl.style.display = "none";
    fragEl.innerHTML = "";
  }
  const key = modalFragancia ? `p-${p.id}--${modalFragancia}` : `p-${p.id}`;
  const q = cart.get(key) || 0;
  const addWrap = $("#productModalAddWrap");
  addWrap.innerHTML = q
    ? `<div class="qty modal-qty"><button id="pmMinus">−</button><span>${q}</span><button id="pmPlus">+</button></div><button id="productModalAdd" class="add">Agregar otro</button>`
    : `<button id="productModalAdd" class="add">Agregar al carrito</button>`;
  if($("#pmMinus")) $("#pmMinus").onclick = ()=>{ change(key,-1); renderProductModal(); };
  if($("#pmPlus")) $("#pmPlus").onclick = ()=>{ change(key,1); renderProductModal(); };
  $("#productModalAdd").onclick = ()=>{ add(key); renderProductModal(); };
}
$("#productModalClose").onclick = closeProductModal;
$("#productModal").addEventListener("click", e=>{
  if(e.target.id === "productModal") closeProductModal();
});
$("#productModalCartBar").onclick = ()=>{
  closeProductModal();
  openCart();
};

// Deslizar con el dedo para pasar de foto en el lightbox
let touchStartX = 0, touchStartY = 0;
const lightboxEl = $("#lightbox");
lightboxEl.addEventListener("touchstart", e=>{
  touchStartX = e.changedTouches[0].clientX;
  touchStartY = e.changedTouches[0].clientY;
}, {passive:true});
lightboxEl.addEventListener("touchend", e=>{
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)){
    lightboxStep(dx < 0 ? 1 : -1);
  }
}, {passive:true});

$("#search").addEventListener("input",e=>{searchTerm=e.target.value.trim().toLocaleLowerCase();renderProducts();renderOffers();renderDestacados();});
$("#search").addEventListener("keydown",e=>{
  if(e.key==="Enter"){ e.preventDefault(); e.target.blur(); }
});
$("#search").addEventListener("search",e=>{ e.target.blur(); }); // dispara al tocar la "x" o la lupa del teclado en iOS/Android
$("#openCart").onclick=openCart;$("#floatingCart").onclick=openCart;$("#closeCart").onclick=closeCart;$("#overlay").onclick=closeCart;
$("#clearCart").onclick=()=>{cart.clear();update();renderProducts();renderOffers();renderDestacados();renderCart();};

$("#whatsappBtn").onclick=()=>{
  if(!cart.size)return;
  $("#customerDialog").showModal();
};

// Guarda el pedido en la pestaña "Pedidos" del Sheets (no bloquea el envío por WhatsApp si falla)
function logOrder(payload){
  if(!CONFIG.ORDERS_WEBHOOK_URL) return;
  fetch(CONFIG.ORDERS_WEBHOOK_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {"Content-Type":"text/plain;charset=utf-8"},
    body: JSON.stringify(payload)
  }).catch(()=>{});
}

$("#customerForm").addEventListener("submit",e=>{
  e.preventDefault();
  let total=0, lines=[];
  cart.forEach((q,key)=>{
    const item=getItem(key);
    if(!item) return;
    total+=item.price*q;
    const idLabel = key.startsWith("o-") ? `O${item.id}` : item.id;
    lines.push(`• [${idLabel}] ${item.name}${key.startsWith("o-")?" (oferta)":""} x${q} — ${money(item.price*q)}`);
  });
  const name=$("#customerName").value.trim();
  const address=$("#customerAddress").value.trim();
  const notes=$("#customerNotes").value.trim();
  let msg=`Hola, Aroma Frida. Quiero hacer el siguiente pedido:\n\n${lines.join("\n")}\n\n*Total: ${money(total)}*`;
  if(name)msg+=`\n\nNombre: ${name}`;
  if(address)msg+=`\nDirección / localidad: ${address}`;
  if(notes)msg+=`\nObservaciones: ${notes}`;
  logOrder({ name, address, notes, items: lines.join(" | "), total: money(total) });
  window.open(`https://wa.me/${PHONE}?text=${encodeURIComponent(msg)}`,"_blank");
  $("#customerDialog").close();
});

/* ---------- Arranque ---------- */
async function init(){
  productsEl.innerHTML = `<div class="empty"><div style="font-size:36px">⏳</div><p>Cargando catálogo...</p></div>`;
  await loadCatalog();
  renderCategories();
  renderProducts();
  renderOffers();
  renderDestacados();
  renderCart();
  update();
}
init();
