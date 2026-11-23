# Talonario · SaaS de facturación

Cada usuario carga sus clientes y emite facturas desde un panel privado:

- **letra A, B o C** según la condición de IVA del emisor y del cliente;
- IVA y totales calculados **en centavos enteros**;
- **numeración correlativa** por punto de venta y letra;
- **PDF** guardado en un bucket S3 (RustFS), que se manda por **email**;
- ingreso **sin contraseña**, con un enlace mágico por mail.

La landing pública se diseñó con la skill `frontend-design`. La idea es el
talonario de facturas de papel: la hoja original, el duplicado amarillo y el
talón troquelado.

El enunciado original está en [README-enunciado.md](README-enunciado.md).

> Las facturas **no son válidas ante ARCA**: no hay conexión con sus servicios
> ni CAE, y el PDF lo dice al pie. La letra, el cálculo del IVA y el formato sí
> siguen las reglas reales.

## Demo

Se publica en **https://talonario-facturacion.onrender.com** (pendiente:
ver «Despliegue»). Es el plan gratuito: si estuvo un rato sin visitas,
tarda unos 50 segundos en despertar.

Entrá con cualquier email inventado, por ejemplo `tu-nombre@demo.test`. La
demo no manda mails de verdad: el enlace para entrar y las facturas
enviadas aparecen en la **bandeja de demo** (`/bandeja`). Es pública: no
uses datos reales.

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 16 (App Router, Cache Components) + TypeScript + Tailwind CSS 4 |
| Base de datos | MongoDB con el driver nativo, singleton en `lib/db.ts` |
| Email | Nodemailer → MailHog en desarrollo |
| Almacenamiento | RustFS (S3) con `@aws-sdk/client-s3`; el bucket se crea si no existe |
| PDF | `pdf-lib` (JavaScript puro, sin navegador ni binarios) |
| Estado global | `GlobalContext` de React: usuario, datos de emisor y preferencias |
| Protección de rutas | `proxy.ts`, el sustituto de `middleware.ts` en Next.js 16 |
| Sesión | JWT HS256 (`jose`) en una cookie `httpOnly` |
| Tests | Vitest + cobertura v8, en el pipeline de GitLab |

## Cómo funciona

```
┌──────────────┐  Server Components leen MongoDB   ┌──────────┐
│  Next.js     │ ────────────────────────────────► │ MongoDB  │
│  landing +   │                                   │ saas_    │
│  panel       │  Client Components → /api/…  ───► │facturacion│
└──────────────┘                                   └──────────┘
        │ /api/invoices/<id>/issue, /pdf, /send
        ▼
  lib/store/invoices.ts ── pdf-lib ──► PDF ──► RustFS (S3)  users/<id>/invoices/<id>.pdf
                        └─ Nodemailer ──► MailHog :1025 (con el PDF adjunto)
```

- **Server Components leen MongoDB directamente.** El resumen, el listado de
  facturas, el detalle y la primera lista de clientes se arman en el
  servidor con las funciones de `lib/store/`.
- **Client Components llaman a la API.** Emitir, cobrar, anular, enviar,
  guardar el perfil y el ABM de clientes llaman a `/api/…`. Los errores
  vuelven como `{ error: "…" }` con el código HTTP que corresponde (400,
  401, 404, 409, 429, 502, 503).
- **Todo filtra por `userId`, que sale de la sesión** y nunca de la
  petición. Una factura o un cliente de otro usuario dan 404, igual que uno
  que no existe.

### La vida de una factura

```
Borrador ──(Emitir)──► Emitida ──(Marcar pagada)──► Pagada
   │                     │  ▲                         │
 (Borrar)             (Anular) └────(Desmarcar)───────┘
                         ▼
                      Anulada
```

- **Borrador.** Se edita y se borra libremente. Su letra se recalcula al
  mostrarlo, porque depende de la condición del emisor y del cliente.
- **Al emitir**, la factura recibe:
  - la letra;
  - el **próximo número** de su punto de venta y letra;
  - la fecha de emisión;
  - una **copia fija** de los datos del emisor y del cliente;
  - su PDF, que se guarda en el bucket.

  Desde ahí no se edita ni se borra.
- **Anular** deja la factura con su número y regenera el PDF con un sello de
  «ANULADA». Una factura pagada no se anula: primero hay que desmarcar el
  pago.
- Se puede **duplicar** cualquier factura: crea un borrador nuevo con el
  mismo cliente y las mismas líneas.

### Colecciones

| Colección | Qué guarda |
|-----------|------------|
| `users` | Email, datos de emisor (`profile`), dónde está el logo en el bucket, preferencias |
| `loginTokens` | Hash SHA-256 de cada enlace mágico, con vencimiento (índice TTL) |
| `clients` | Clientes del usuario: nombre, CUIT/DNI, condición de IVA, email, domicilio |
| `invoices` | Facturas: estado, letra, número, líneas, totales en centavos, copias del emisor y del cliente, clave del PDF |
| `counters` | Último número usado por (usuario, punto de venta, letra) |
| `outbox` | Solo en la demo: los mails que se habrían enviado (se borran a los 3 días) |

En el bucket (privado), todo lo de un usuario va bajo `users/<id>/`: el
logo y un PDF por factura. Los archivos se sirven a través de la API, que
comprueba la sesión.

## Cómo ejecutar

1. **MongoDB, MailHog y RustFS** en Docker: `docker compose up -d`. Si ya
   tenés alguno andando por otro proyecto, levantá solo los que faltan, por
   ejemplo `docker compose up -d rustfs`.
   - Si en lugar de MailHog usás Mailpit en los mismos puertos, sirve igual.
   - En RustFS, `AWS_URL` es la **API S3** (el `9001` del enunciado; dentro
     del contenedor es el `9000`). La consola web queda en
     http://localhost:9002.
2. **`.env.local`** con las variables del enunciado (están en
   [`.env.example`](.env.example)):

   ```env
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB=saas_facturacion

   AWS_USERNAME=rustfsadmin
   AWS_PASSWORD=rustfsadmin
   AWS_REGION=us-east-1
   AWS_URL=http://localhost:9001

   MAILHOG_HOST=localhost
   MAILHOG_PORT=1025
   ```

3. Instalar, sembrar y arrancar:

   ```bash
   npm install
   npx tsx scripts/seed.ts
   npm run dev
   ```

4. Entrar en http://localhost:3000/login con **`demo@talonario.test`** (o
   el email de `SEED_OWNER_EMAIL`) y abrir el enlace desde MailHog
   (http://localhost:8025).

El seed crea:

- el emisor «Tostadero La Esquina», responsable inscripto;
- seis clientes de todas las condiciones de IVA;
- once facturas de los últimos meses, en todos los estados;
- un borrador listo para emitir.

Se puede correr las veces que haga falta: borra y vuelve a crear los datos
**de ese usuario** nada más. Los PDF se generan (y se guardan en RustFS) la
primera vez que se abren, así que el seed no necesita RustFS levantado.

Al arrancar, el servidor crea el bucket `saas-facturacion` si no existe y lo
avisa en la consola. Si RustFS no está levantado, avisa y arranca igual.

### Scripts

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilar y servir en producción (pide `JWT_SECRET`) |
| `npm test` / `npm run test:coverage` | Tests (con cobertura) |
| `npm run lint` / `npm run typecheck` | ESLint y TypeScript |
| `npm run seed` | Lo mismo que `npx tsx scripts/seed.ts` |

## Despliegue

La demo corre en **Render** (plan gratuito), con la base en **MongoDB
Atlas** y los PDF en un **bucket S3 en la nube**. La configuración está en
[`render.yaml`](render.yaml).

| Pieza | Servicio | Plan |
|-------|----------|------|
| App Next.js | Render, servicio web (Virginia) | Free |
| Base de datos | MongoDB Atlas, AWS N. Virginia | Free (M0) |
| PDF y logos | Backblaze B2 (compatible con S3) | Free (10 GB) |
| Correo | Bandeja de demo en la propia base (`MAIL_TRANSPORT=outbox`) | Sin costo |

1. **Base.** Sirve el clúster de Atlas de otros proyectos: esta app usa la
   base `saas_facturacion`.
2. **Bucket.** En Backblaze B2, crear un bucket **privado** y una
   *Application Key* con acceso solo a ese bucket. El bucket muestra su
   *Endpoint* (`s3.<región>.backblazeb2.com`).
3. **Código en GitHub**, porque Render no se conecta al GitLab de la
   academia.
4. **Servicio.** En Render, *New → Blueprint* con ese repositorio. Render
   inventa `JWT_SECRET` solo y pide estas variables:

   | Variable | Valor |
   |----------|-------|
   | `MONGODB_URI` | La cadena de Atlas |
   | `AWS_URL` | `https://` + el endpoint del bucket |
   | `AWS_REGION` | La región del endpoint, por ejemplo `us-east-005` |
   | `AWS_BUCKET` | El nombre del bucket |
   | `AWS_USERNAME` | El *keyID* de la Application Key |
   | `AWS_PASSWORD` | La *applicationKey* |

5. **Datos de ejemplo** (opcional), desde tu máquina, con la cadena de Atlas
   en la variable `MONGODB_URI` y `SEED_OWNER_EMAIL=demo@demo.test`.

El código es el mismo que en local: cambiar de RustFS a B2 es solo cambiar
las variables `AWS_*` (decisión 7).

## Tests y cobertura

```
npm test                 # 139 tests
npm run test:coverage    # con el informe en coverage/
```

| Archivo | Qué prueba |
|---------|------------|
| `money.test.ts` | Leer «1.234,56», «1500.50», «1.500» sin coma flotante; formato argentino; topes |
| `invoice.test.ts` | Letra A/B/C, redondeos al centavo, IVA por alícuota, BigInt en importes enormes, que en una B las líneas sumen el total, pie de factura, estados |
| `validation.test.ts` | CUIT con dígito verificador, documento según la condición, clientes, perfil, líneas y borradores |
| `pdf.test.ts` | PDF A, B y C, con logo PNG o JPG o dañado, anulada, varias páginas, emojis y chino, determinismo |
| `storage.test.ts` | Bucket que se crea si no existe, reintentos, archivos, errores de S3 |
| `mail.test.ts` | Envío por SMTP con conexión reutilizada y bandeja de demo |
| `format.test.ts` | Fechas en hora argentina, meses, días entre fechas |
| `misc.test.ts` | `proxy.ts`, JWT, logo por sus bytes, remitente, redirección segura |

El pipeline (`.gitlab-ci.yml`) corre lint, tipos y tests con cobertura, y
publica el informe en GitLab. La cobertura de `lib/` es 99 % de líneas y
98 % de ramas.

Las rutas de la API y `lib/store/` son consultas a MongoDB, así que se
probaron de punta a punta en el navegador, con base, SMTP y S3 simulados:

- **ingreso:** el enlace sirve una sola vez, y la sesión vuelve a la página
  que se había pedido;
- **facturas:** borrador, edición, emisión con el número siguiente, PDF,
  envío (y reenvío bloqueado por un minuto), pagada, desmarcada y anulada;
- **validaciones:** CUIT inválido, precio con 3 decimales, vencimiento
  pasado, borrar un cliente con facturas;
- **perfil:** cambiar a monotributista convierte el borrador en C;
- **S3 caído al emitir:** la factura se emite igual, el PDF da 503 y se
  genera solo cuando S3 vuelve;
- **aislamiento:** un segundo usuario recibe 404 en las siete operaciones
  sobre una factura ajena y no ve ningún cliente.

## Decisiones de diseño

### 1. Dinero en centavos, de punta a punta

**Contexto.** El enunciado pone como regla obligatoria trabajar en
céntimos. En coma flotante, `4.35 * 100` da `434.99999999999994`, y una
factura tiene que cerrar al centavo.

**Decisión.** Todo importe es un entero en centavos (`…Cents`) y toda
cantidad un entero en centésimos:

- **En el navegador,** el texto que se escribe se convierte a entero
  (`lib/money.ts`) sin pasar nunca por un número con decimales. Acepta
  «1.234,56», «1234.56» y «1.500».
- **En la API** llegan enteros, y el servidor los vuelve a validar.
- **Al multiplicar** (cantidad × precio, neto × alícuota) se usa `BigInt`,
  para que ni el resultado intermedio pierda precisión.
- **Las alícuotas** van en puntos básicos (2100 = 21 %).

**Consecuencias.** Recién al mostrar un importe se divide por 100. Hay un
tope por línea ($ 100.000 millones) para que el total de 50 líneas entre
holgado en un entero exacto.

### 2. Redondear el IVA línea por línea

**Contexto.** El IVA se puede redondear una vez por alícuota o una vez por
línea. En una factura B los precios van con IVA incluido, y si se redondea
por alícuota, la suma de las líneas puede no dar el total.

**Decisión.** Por línea, al centavo más cercano y con la mitad hacia
arriba. El IVA de cada alícuota es la suma de sus líneas.

**Consecuencias.** En cualquier letra, la suma de las líneas da exactamente
el total; hay un test que lo comprueba. Contra el redondeo por alícuota, la
diferencia es de algún centavo en facturas con muchas líneas.

### 3. La letra la decide la condición de IVA

**Contexto.** Elegir A, B o C a mano es un error común.

**Decisión.** La letra no se elige: sale de `invoiceType()`.

- Un responsable inscripto hace **A** a otro inscripto o a un
  monotributista, y **B** a un consumidor final o a un exento.
- Un monotributista o un exento hace siempre **C**, sin IVA.

La factura B muestra además el «IVA contenido» que pide la Ley 27.743
(Régimen de Transparencia Fiscal al Consumidor).

**Consecuencias.** En un borrador, la letra se recalcula al mostrarlo; si
cambia la condición del emisor o del cliente, el borrador cambia con ella.
Al emitir, queda fija.

### 4. Numeración atómica, y un número por emisión

**Contexto.** Dos facturas no pueden compartir número, ni siquiera si se
emiten al mismo tiempo o con un doble clic.

**Decisión.** Emitir tiene dos pasos:

1. **Reclamar el borrador.** Se pasa a «emitida» con una actualización
   condicional: tiene que seguir siendo borrador y no haber cambiado desde
   que se validó. Un segundo clic no encuentra nada que reclamar.
2. **Pedir el número.** Un contador por (usuario, punto de venta, letra) se
   incrementa con `$inc`, que es atómico.

Un índice único parcial sobre el número es la red de seguridad.

**Consecuencias.**

- Sin transacciones, para que funcione con un MongoDB local sin réplica.
  Si el proceso se cae justo entre los dos pasos, queda una factura emitida
  sin número: es raro, y se ve.
- Cada punto de venta y letra tiene su numeración (A y B van por separado),
  como en ARCA.

### 5. Lo emitido no se toca: copia del emisor y del cliente

**Contexto.** Si el cliente se muda o el emisor cambia de domicilio, una
factura ya emitida tiene que seguir diciendo lo que decía.

**Decisión.**

- Al emitir se copian los datos del emisor y del cliente dentro de la
  factura.
- Una emitida no se edita ni se borra: si hubo un error, se anula (conserva
  su número) y se duplica.
- El PDF se genera al emitir y se guarda; al anular se regenera con el
  sello.

**Consecuencias.** No hay notas de crédito: anular es una marca, no un
comprobante nuevo. Un cliente con facturas no se puede borrar (409).

### 6. El PDF con pdf-lib, en el servidor

**Contexto.** El PDF podría generarse con un navegador sin interfaz
(Puppeteer) o dibujándolo con una librería.

**Decisión.** `pdf-lib`: JavaScript puro, sin binarios, rápido y
determinístico (la misma factura da el mismo PDF). Las fuentes estándar no
tienen emojis ni chino: lo que no se puede escribir se cambia por «?» en vez
de romper el documento.

**Consecuencias.** El diseño se dibuja a mano: coordenadas, cortes de
renglón y páginas de continuación. A cambio, corre en Render gratis sin
instalar nada.

### 7. S3 con un solo código para RustFS y la nube

**Contexto.** En local se usa RustFS. Render no tiene almacenamiento
persistente gratis.

**Decisión.**

- **Un mismo código.** `lib/storage.ts` usa el SDK de AWS con
  `forcePathStyle` y las variables del enunciado (`AWS_URL`,
  `AWS_USERNAME`…). En local apunta a RustFS; en la demo, a Backblaze B2.
- **El bucket** se crea si no existe: al arrancar y, si falló, en el primer
  uso.
- **El bucket es privado.** Los archivos se sirven por la API, que comprueba
  la sesión.

**Consecuencias.**

- Si S3 está caído, la factura se emite igual y el PDF se genera la primera
  vez que se pide con S3 de vuelta.
- Descargar un PDF pasa por el servidor en vez de ir directo al bucket. Para
  archivos de pocos KB no importa.

### 8. Ingreso con enlace mágico de un solo uso, con botón

**Contexto.** El enunciado pide ingreso sin contraseña.

**Decisión.**

- **El enlace.** 32 bytes al azar; en la base se guarda solo su hash
  SHA-256. Vale 15 minutos y una sola vez (se canjea con
  `findOneAndUpdate`, que es atómico).
- **Límite.** Hasta 3 enlaces cada 10 minutos por email.
- **Un botón.** Abrir el enlace muestra un botón «Entrar», en vez de entrar
  directo: los antivirus de correo abren los enlaces para revisarlos y lo
  gastarían.
- **La cuenta** se crea en el primer ingreso.

**Consecuencias.** Si se entró por un enlace a una página del panel, se
vuelve a ella después de entrar, pero solo a páginas `/panel` (nunca a otra
web).

### 9. Server Components para leer, la API para cambiar

**Contexto.** El enunciado pide una separación estricta.

**Decisión.**

- **Leer.** Las páginas del panel son Server Components que leen MongoDB
  con `lib/store/`, las mismas funciones que usa la API.
- **Cambiar.** Los Client Components solo llaman a `/api/…`.
- **Estado global.** El `GlobalContext` arranca con los datos que carga el
  layout del servidor, y el perfil lo actualiza con la respuesta de la API.

**Consecuencias.** Next.js 16 esconde las páginas en vez de cerrarlas. El
editor de facturas vuelve a cero al esconderse, y se reinicia (por `key`)
si el borrador cambió.

### 10. Fechas de factura como texto «AAAA-MM-DD» en hora argentina

**Contexto.** Render corre en UTC. A las 22 h de Buenos Aires allá ya es
mañana, y una fecha guardada como instante se corre un día.

**Decisión.** Emisión y vencimiento son días de calendario: se guardan como
texto `AAAA-MM-DD`, calculados en hora argentina. Así se comparan y ordenan
como texto («vencida» = `dueDate < hoy`).

**Consecuencias.** Los instantes (pagada, anulada, enviada) siguen siendo
`Date` y se muestran en hora argentina.

### 11. Correo en la demo: una bandeja en la base

**Contexto.** Render gratis bloquea los puertos SMTP.

**Decisión.** Con `MAIL_TRANSPORT=outbox`, los mails (el enlace para entrar
y las facturas, con el nombre del PDF adjunto) se guardan en MongoDB y se
ven en `/bandeja`. En local, Nodemailer manda a MailHog (`MAILHOG_HOST`,
`MAILHOG_PORT`). Con un servidor propio, sirve cualquier SMTP real
(`SMTP_HOST`…) sin cambiar el código.

**Consecuencias.** La bandeja es pública: es una demo con datos inventados.
Cada mail se borra a los 3 días.

## Uso de IA

El proyecto se desarrolló con Claude como asistente de programación. Antes
de escribir código decidí cuatro cosas:

- los impuestos: Argentina, en pesos, con A/B/C;
- la vida de la factura: borrador, emitida, pagada;
- los extras: PDF en RustFS, envío por email, panel con métricas, y logo y
  datos del emisor;
- y publicar la demo con un bucket S3 en la nube.

Lo que se revisó y cambió sobre lo generado:

- **La prueba en el navegador encontró que editar un borrador dos veces
  deshacía la primera edición.** Next.js 16 esconde las páginas en vez de
  cerrarlas, y el formulario volvía a los datos de la primera visita. Se
  corrigió reiniciando el editor cuando el borrador cambió (decisión 9).
- **Se buscó un ejemplo real del error de coma flotante** para la landing.
  `3 × 1234.57` daba bien; `4.35 × 100` da `434.99999999999994`.
- **Al decidir el redondeo del IVA** se comparó por alícuota contra por
  línea, y se eligió por línea para que la B cierre exacta (decisión 2).
- **Se probó qué pasa si RustFS se cae al emitir:** la factura no puede
  quedar a medias. Se separó la emisión del guardado del PDF (decisión 7).
- **Se probó el aislamiento entre usuarios a propósito**, con una segunda
  cuenta intentando leer, cobrar, anular, enviar, duplicar y borrar una
  factura ajena.
- **El PDF se revisó página por página** (A, B, C y anulada) contra el
  formato de una factura argentina: letra con su código, punto de venta y
  número, CUIT e inicio de actividades.

## Estructura

```
app/
  page.tsx                    landing pública
  login/, auth/verify/        ingreso con enlace mágico
  panel/                      resumen, facturas (listado, nueva, detalle, editar), clientes, perfil
  bandeja/                    bandeja de demo (solo con MAIL_TRANSPORT=outbox)
  api/                        auth, profile (+ logo), clients, invoices (+ issue, pay, cancel, pdf, send, duplicate), outbox
components/                   formularios y vistas (InvoiceEditor, InvoiceDocument, InvoiceActions…)
lib/
  money.ts, invoice.ts        centavos, IVA, letra, numeración, estados
  validation.ts               CUIT, clientes, perfil, líneas
  pdf.ts, storage.ts          PDF con pdf-lib y S3
  db.ts, store/               MongoDB: colecciones y consultas por usuario
  auth.ts, jwt.ts             sesión y enlaces mágicos
  context/GlobalContext.tsx   estado global del panel
proxy.ts                      protección de /panel
scripts/seed.ts               datos de ejemplo
```
