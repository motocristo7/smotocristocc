# 🏍️ Mercado Moto CC · Tienda Online de Repuestos

Aplicación web frontend independiente, ultra rápida y 100% responsiva para clientes de **Servimotos Cristo Centro** (Mérida, Venezuela). Diseñada exclusivamente para la experiencia de compra del cliente sin vistas administrativas, POS ni rutas internas.

---

## 🌟 Características Principales

1. **Base de Datos Compartida en Tiempo Real:**
   - Se conecta automáticamente a la API central de tu sistema administrativo.
   - Cualquier cambio de precio, nuevo repuesto o ajuste de stock que hagas desde tu panel interno se refleja en tiempo real en esta tienda.
   
2. **Precios Duales en $ USD y Bolívares (Bs.):**
   - Sincronización automática de la tasa oficial del Banco Central de Venezuela (BCV).
   - Conversión instantánea de cada producto y cálculo de totales en ambas monedas.

3. **Catálogo con Buscador & Filtros:**
   - Búsqueda en vivo por nombre de repuesto, código SKU, modelo de moto y marca (Bera, Empire Keeway, Yamaha, Honda, Suzuki, etc.).
   - Filtros por categoría (Frenos, Motor, Transmisión, Suspensión, Llantas, Eléctrico, Tapicería, Accesorios, Lubricantes).

4. **Carrito y Proceso de Compra Venezolano:**
   - Modalidades de entrega:
     - 🏬 **Retiro personal** en taller físico (Mérida).
     - 🛵 **Delivery** local en Mérida.
     - 🚚 **Envíos nacionales** con cobro en destino por **MRW, Zoom o Tealca** (solicita número de cédula y datos exigidos por las agencias).
   - Métodos de pago venezolanos con botones para copiar datos en 1 clic:
     - Pago Móvil Banesco
     - Transferencia Banesco
     - Efectivo Divisas ($)
     - Binance Pay
   - Botón directo para enviar el pedido formateado con desglose y comprobante directamente al WhatsApp de la tienda.

5. **Portal de Autoservicio del Cliente:**
   - Los clientes pueden ingresar su número de teléfono o placa de moto para consultar en vivo el estado de su moto en el taller mecánico (`En Espera`, `En Reparación`, `Lista para Entrega`) y su historial de facturas.

---

## 📁 Estructura del Proyecto

```text
mercadomotocc-app/
├── index.html                   # Entry point HTML con meta etiquetas OpenGraph y SEO
├── package.json                 # Dependencias (React 19, Vite 6, Tailwind CSS v4, Lucide)
├── vite.config.ts               # Configuración de compilación Vite y Tailwind
├── tsconfig.json                # Configuración TypeScript
├── .env.example                 # Variables de entorno para conectar la base de datos
├── src/
│   ├── main.tsx                 # Montaje de React
│   ├── index.css                # Estilos globales con Tailwind CSS
│   ├── App.tsx                  # Componente raíz de la tienda
│   ├── types/
│   │   └── index.ts             # Definición de tipos TypeScript (Product, Cart, Settings)
│   ├── services/
│   │   └── api.ts               # Cliente API de conexión a la base de datos compartida
│   ├── utils/
│   │   └── formatters.ts        # Formateadores de moneda ($ / Bs.) y generador de WhatsApp
│   ├── context/
│   │   └── StoreContext.tsx     # Estado global de la tienda, carrito y sincronización
│   └── components/
│       ├── Navbar.tsx           # Barra superior con tasa BCV, buscador y carrito
│       ├── Catalog.tsx          # Catálogo con filtros de categorías y marcas
│       ├── CartDrawer.tsx       # Carrito lateral y checkout con entrega y pago
│       ├── CustomerPortal.tsx   # Consulta de estatus de moto en taller por teléfono o placa
│       └── Footer.tsx           # Pie de página con datos bancarios, dirección y horarios
```

---

## 🚀 Puesta en Marcha Local

### 1. Clonar o copiar la carpeta
```bash
cd mercadomotocc-app
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Crea un archivo `.env` basado en `.env.example`:
```bash
cp .env.example .env
```
Edita `.env` con la URL de tu API o backend:
```env
VITE_API_BASE_URL=https://ais-pre-flhofni32tpb4dwfwnak7d-506340403707.us-west1.run.app
VITE_STORE_WHATSAPP=584122242450
VITE_STORE_NAME="Mercado Moto CC"
```

### 4. Iniciar en modo desarrollo
```bash
npm run dev
```
La tienda estará corriendo en `http://localhost:3001`.

---

## 🗄️ Conexión a la Base de Datos Compartida

### Opción A: Mediante la API de tu Sistema Administrativo (Recomendado)
El archivo `src/services/api.ts` ya viene programado para conectarse a tu backend central en los endpoints:
- `GET /api/data`: Descarga productos, configuración de la empresa y órdenes del taller.
- `GET /api/bcv`: Consulta la tasa oficial del BCV en tiempo real.
- `POST /api/sales`: Registra los nuevos pedidos online en la base de datos central.

### Opción B: Conexión directa a Supabase (PostgreSQL)
Si deseas conectar esta aplicación directamente a tu base de datos de **Supabase**, solo instala `@supabase/supabase-js`:
```bash
npm install @supabase/supabase-js
```
Y en `src/services/api.ts`, inicializa el cliente con tu clave anónima:
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

---

## 📦 Cómo Subir este Proyecto a GitHub

1. Inicializa el repositorio Git dentro de la carpeta:
```bash
git init
git add .
git commit -m "feat: Lanzamiento oficial de Mercado Moto CC"
```

2. Crea un nuevo repositorio en tu cuenta de GitHub (ejemplo: `mercadomotocc-web`).

3. Vincula el remoto y sube el código:
```bash
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mercadomotocc-web.git
git push -u origin main
```

4. **Despliegue Gratuito en 1 clic:**
   - Puedes conectar este repositorio de GitHub en **Vercel** (`vercel.com`) o **Netlify** (`netlify.com`).
   - En las variables de entorno de Vercel/Netlify, agrega `VITE_API_BASE_URL` apuntando a tu backend.
   - ¡Tu tienda tendrá su propio dominio web gratis o con dominio personalizado (`.com` / `.com.ve`)!
