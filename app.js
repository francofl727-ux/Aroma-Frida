
/* ======================= CONFIGURACIÓN ======================= */
// 1) Publicá tu Google Sheet compartido como "Cualquier persona con el enlace: Lector".
// 2) Copiá el ID de la hoja (está en la URL, entre /d/ y /edit) y pegalo abajo.
// 3) Las pestañas (hojas) deben llamarse "Productos" y "Ofertas" (ver README-ADMIN.md).
const CONFIG = {
  SHEET_ID: "1Con4IbPzoO9H_Y7lcZxqlG-S1G6nsdE5bg5nAfm1V3U",
  PRODUCTS_TAB: "Productos",
  OFFERS_TAB: "Ofertas",
  IMAGE_WIDTH: 640           // resolución de imagen que se pide al CDN (evita fotos borrosas)
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

function normalizeProducts(rows){
  return rows
    .filter(r => r.nombre && String(r.nombre).trim() && isActivo(r.activo))
    .map((r, i) => ({
      id: r.id !== undefined && r.id !== "" ? Number(r.id) : i + 1,
      name: String(r.nombre).trim(),
      price: Number(r.precio) || 0,
      category: (r.categoria ? String(r.categoria).trim() : "Otros") || "Otros",
      image: r.imagen ? String(r.imagen).trim() : "",
      description: r.descripcion ? String(r.descripcion).trim() : ""
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
    const hay = `${p.name} ${p.category}`.toLocaleLowerCase();
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
}

function card(p){
  const q=cart.get("p-"+p.id)||0;
  return `<article class="card">
    <div class="card-image">
      <img loading="lazy" src="${escapeAttr(sharpen(p.image))}" alt="${escapeAttr(p.name)}" onerror="this.style.opacity='.15'">
      <span class="badge">${escapeHtml(p.category)}</span>
      <span class="badge id-badge">#${p.id}</span>
    </div>
    <div class="card-body">
      <h3>${escapeHtml(p.name)}</h3>
      ${p.description ? `<p class="desc">${escapeHtml(p.description)}</p>` : ""}
      <div class="price">${money(p.price)}</div>
      <div class="card-actions">
        ${q ? `<div class="qty"><button data-minus="${p.id}">−</button><span>${q}</span><button data-plus="${p.id}">+</button></div>` : ""}
        <button class="add" data-add="${p.id}">${q?"Agregar otro":"Agregar al carrito"}</button>
      </div>
    </div>
  </article>`;
}

function renderOffers(){
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
  const gallery = images.length>1
    ? `<div class="offer-gallery gallery-${images.length}">${images.map(src=>`<img loading="lazy" src="${escapeAttr(src)}" alt="${escapeAttr(o.name)}" onerror="this.style.opacity='.15'">`).join("")}</div>`
    : (images[0] ? `<img loading="lazy" src="${escapeAttr(images[0])}" alt="${escapeAttr(o.name)}" onerror="this.style.opacity='.15'">` : "");
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
// getItem: devuelve {name, price, image} tanto si es producto como si es oferta
function getItem(key){
  const [type, idStr] = key.split("-");
  const id = Number(idStr);
  if(type==="o") return offers.find(o=>o.id===id);
  return products.find(p=>p.id===id);
}

function add(key){cart.set(key,(cart.get(key)||0)+1);update();renderProducts();renderOffers();renderCart();}
function change(key,delta){
  const next=(cart.get(key)||0)+delta;
  if(next<=0)cart.delete(key);else cart.set(key,next);
  update();renderProducts();renderOffers();renderCart();
}
function update(){
  let count=0,total=0;
  cart.forEach((q,key)=>{count+=q;const item=getItem(key);if(item){total+=item.price*q;}});
  $("#cartCount").textContent=count;$("#floatingCount").textContent=count;$("#cartTotal").textContent=money(total);
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

$("#search").addEventListener("input",e=>{searchTerm=e.target.value.trim().toLocaleLowerCase();renderProducts()});
$("#openCart").onclick=openCart;$("#floatingCart").onclick=openCart;$("#closeCart").onclick=closeCart;$("#overlay").onclick=closeCart;
$("#clearCart").onclick=()=>{cart.clear();update();renderProducts();renderOffers();renderCart();};

$("#whatsappBtn").onclick=()=>{
  if(!cart.size)return;
  $("#customerDialog").showModal();
};

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
  renderCart();
  update();
}
init();
