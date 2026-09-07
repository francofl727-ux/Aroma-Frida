# Administrar el catálogo desde Google Sheets

Ahora los precios, descripciones, categorías, imágenes y las ofertas se cargan
desde tu Google Sheets. Editás una celda, guardás (se guarda solo) y en unos
minutos se actualiza en la web. No hay que tocar código nunca más.

## 1) Preparar la planilla

Necesitás **dos pestañas** (hojas) dentro del mismo Google Sheets:

### Pestaña "Productos"
Columnas (deben llamarse exactamente así, en la primera fila):

| id | nombre | precio | categoria | imagen | descripcion | activo |
|----|--------|--------|-----------|--------|--------------|--------|

- **id**: un número único por producto (no lo repitas).
- **nombre**: nombre del producto.
- **precio**: solo el número, sin "$" ni puntos de miles (ej: `15000`).
- **categoria**: por ejemplo "Sahumerios", "Hornillos", etc.
- **imagen**: la URL de la foto.
- **descripcion**: opcional, un texto corto debajo del nombre.
- **activo**: escribí `no` para ocultar un producto sin borrarlo. Si lo dejás
  vacío, se considera activo.

Te dejo el archivo **`products_template.csv`** con tus 235 productos actuales
ya cargados en este formato. Para usarlo:
1. Abrí tu Google Sheets.
2. Si ya tenés una hoja con estos productos, podés reemplazarla o crear una
   nueva pestaña llamada **Productos**.
3. Archivo → Importar → subís `products_template.csv` → "Reemplazar hoja
   actual" (o "Insertar nueva hoja") → importar.

### Pestaña "Ofertas"
Columnas:

| id | nombre | descripcion | precio | productos_ids | imagen | activo |
|----|--------|-------------|--------|----------------|--------|--------|

- **productos_ids**: los `id` de la pestaña Productos que forman el combo,
  separados por coma. Ejemplo: `1,2,3`.
- **imagen**: opcional. Podés poner **una sola foto** o **varias separadas por
  coma** (ej: `https://.../foto1.jpg, https://.../foto2.jpg`) y en la web se
  van a mostrar juntas, en mosaico. Si la dejás vacía, se usan automáticamente
  las fotos de los productos incluidos en el combo.
- El resto de las columnas funcionan igual que en Productos.

Te dejo `offers_template.csv` con un ejemplo para que veas el formato.
Importalo igual que el anterior, en una pestaña llamada **Ofertas**.

## 2) Compartir la planilla

1. En Google Sheets, arriba a la derecha, tocá **Compartir**.
2. Cambiá el acceso general a **"Cualquier persona con el enlace"** → rol
   **Lector**.
3. No hace falta "Publicar en la web", solo con este paso alcanza.

## 3) Conectar la web con tu planilla

1. Mirá la URL de tu Google Sheets, tiene esta forma:
   `https://docs.google.com/spreadsheets/d/AQUI_ESTA_EL_ID/edit`
2. Copiá esa parte (el ID, una tira larga de letras y números).
3. Abrí el archivo `app.js` del proyecto y pegalo en la primera línea de la
   configuración:

   ```js
   const CONFIG = {
     SHEET_ID: "AQUI_ESTA_EL_ID",
     ...
   };
   ```
4. Subí de nuevo el proyecto a Vercel (o hacé el deploy con el cambio).

Listo: a partir de ahí, cualquier cambio que hagas en la planilla (precio,
descripción, alta o baja de producto, ofertas) se refleja solo en la web, sin
tocar código. Si alguna vez no ves el cambio al toque, esperá un minuto y
refrescá la página (Google tarda un poquito en propagar el cambio).

## Si todavía no configuraste el Sheet

Mientras `SHEET_ID` esté vacío, o si por algún motivo no se puede leer la
planilla (sin internet, ID mal copiado, etc.), la web sigue funcionando
normalmente usando el catálogo que quedó guardado en `catalog-fallback.js`
(los datos que ya tenías). Así nunca se rompe el sitio.

## Identificar productos por ID

En cada producto y cada oferta de la web ahora se ve su número de ID (arriba
a la derecha de la foto, ej: `#12` para un producto o `#O3` para una oferta).
Ese mismo número es el que figura en la columna `id` del Sheets, y también
aparece en el carrito y en el mensaje de WhatsApp del pedido — así es fácil
identificar de qué producto habla el cliente y encontrarlo rápido en la
planilla.

## Imágenes borrosas

Se solucionó de forma automática: las fotos vienen del proveedor
(mitiendanube/Tiendanube) en una versión chiquita (50px) pensada para otro
uso. Ahora la web les pide automáticamente una versión más grande (640px) a
la misma URL, así que no tenés que cambiar nada en las imágenes que ya
tenías ni en las nuevas que cargues en la planilla — se ven nítidas solas.

Si alguna imagen puntual se sigue viendo borrosa, probablemente la foto
original que subieron a Tiendanube ya era de baja calidad; en ese caso
conviene resubir esa foto en mejor resolución en Tiendanube y volver a copiar
la URL en la planilla.
