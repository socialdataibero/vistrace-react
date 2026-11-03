# vistrace

vistrace es una aplicacion web para explorar, transformar y presentar datos de forma visual. Combina un lienzo de nodos, ejecucion local con DuckDB y asistencia de IA para construir flujos de analisis sin depender solo de SQL manual.

## Que hace esta aplicacion

Con vistrace puedes:

- cargar archivos locales como CSV, JSON, TSV y Parquet;
- crear flujos visuales con nodos como `Source`, `Group by + Summarize`, `Interactive filter`, `View table`, `Make chart`, `Join tables` y `Custom SQL`;
- generar nodos con ayuda de IA a partir de instrucciones en lenguaje natural;
- organizar visualizaciones dentro de frames para compartirlas como presentacion;
- trabajar con varias paginas dentro del mismo workspace;
- exportar e importar proyectos completos usando archivos `.vzc`.

## Funciones principales

- Canvas visual para analisis de datos
- Ejecucion local con DuckDB en el navegador
- Graficas y tablas interactivas
- Presentacion y comparticion de nodos o frames
- Exportacion/importacion del estado completo del proyecto
- IA para crear nodos y sugerir flujos

## Stack tecnico

- Next.js
- React
- TypeScript
- DuckDB Wasm
- Observable Plot
- Anthropic SDK

## Requisitos

- Linux
- Node.js 24
- npm 10 o superior

Si usas `nvm`, el repo incluye `.nvmrc` con la version recomendada.

## Instalacion en Linux

### 1. Clona el repositorio

```bash
git clone <TU_URL_DE_GITHUB> vistrace
cd vistrace
```

### 2. Usa Node.js 24

Con `nvm`:

```bash
nvm install 24
nvm use 24
```

Verifica:

```bash
node -v
npm -v
```

### 3. Instala dependencias

```bash
npm ci
```

### 4. Configura variables de entorno

Crea el archivo local:

```bash
cp .env.example .env.local
```

Edita `.env.local` y agrega tu clave:

```bash
ANTHROPIC_API_KEY=tu_clave_real
```

## Como correr la app

### Desarrollo

```bash
npm run dev
```

Abre:

```text
http://127.0.0.1:3000
```

Si el puerto `3000` esta ocupado:

```bash
PORT=3003 npm run dev
```

### Produccion

Compila:

```bash
npm run build
```

Levanta el servidor:

```bash
npm run start
```

Con puerto alterno:

```bash
PORT=3003 npm run start
```

## Uso basico

1. Carga un dataset desde el panel de datos.
2. Crea un nodo `Source`.
3. Conecta nodos de transformacion o exploracion.
4. Usa `Make chart` o `View table` para inspeccionar resultados.
5. Si quieres ayuda, abre el panel de IA y describe el flujo que quieres construir.
6. Si quieres compartir una vista, agrupa nodos en un frame y copia el link de presentacion.

## Scripts disponibles

```bash
npm test
npm run test:watch
npm run test:coverage
npm run dev
npm run build
npm run start
npm run typecheck
npm run lint
npm run check:quick
npm run check
```

`npm run check:quick` ejecuta:

- `npm test`
- `npm run typecheck`

`npm run check` ejecuta:

- `npm run check:quick`
- `npm run build`

`npm run lint` queda disponible por separado. A dia de hoy no se incluye en `check` porque el repo ya tiene deuda previa de lint en codigo fuente.

## Estructura del proyecto

```text
src/
  app/          rutas de Next.js
  components/   canvas, panels, nodos y UI
  db/           integracion con DuckDB
  engine/       ejecucion del DAG
  hooks/        hooks de React
  lib/          utilidades puras y logica del canvas
  stores/       estado de la aplicacion
  types/        tipos compartidos
public/         assets estaticos
```

## CI para GitHub

El repo incluye `.github/workflows/ci.yml`, que en Ubuntu ejecuta:

- `npm ci`
- `npm run check`

## Testing y TDD

- `npm test` corre la suite de Vitest.
- `npm run test:watch` deja Vitest en modo interactivo.
- `npm run test:coverage` genera un reporte de cobertura en texto y HTML.
- `npm run check:quick` valida tests + typecheck para iterar mas rapido.
- Usa red/green TDD para cambios de comportamiento en `src/engine`, `src/lib` y `src/app/api`.
- Para una guia corta de colaboracion y niveles de validacion, revisa `CONTRIBUTING.md`.

## Subirlo a GitHub

Si ya creaste el repositorio remoto:

```bash
git remote add origin <TU_URL_DE_GITHUB>
git push -u origin main
```

## Notas

- Las funciones de IA requieren `ANTHROPIC_API_KEY`.
- Los datasets se exploran localmente con DuckDB en el navegador.
- Los proyectos se pueden exportar y compartir como `.vzc`.
