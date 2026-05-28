---
trigger: always_on
---

# ⚛️ Frontend & React Standards (200-react)

**Target Files**: `app/**/*.tsx`, `components/**/*.tsx`

## 🏗️ Architecture
- **Feature-First**: Organiza el código por funcionalidades (features) siempre que sea posible. Cada feature debe ser autocontenida (hooks, componentes, lógica).
- **Screaming Architecture**: La estructura debe revelar la intención del negocio.

## 🧱 Componentes
- **Functional Components**: Usa exclusivamente componentes funcionales y React Hooks.
- **Prohibición de Clases**: No se permite el uso de clases para componentes o manejo de estado.
- **Atomic Design**: Mantén los componentes en `components/ui/` lo más puros y presentacionales posible.

## 🏷️ Type Safety
- **No `any`**: Está prohibido el uso de `any`. Usa `unknown` si el tipo es incierto y valida con Zod o tipos específicos.
- **Props & State**: Define interfaces claras para las Props de los componentes y tipos específicos para el estado de la API y manejadores de estado globales (ej. Zustand).

## 🎨 Styling
- **Tailwind CSS**: Usa exclusivamente Tailwind CSS para el diseño. 
- **Tailwind 4**: Escribe código compatible con los estándares de **Tailwind CSS 4.0** (evitar plugins innecesarios, preferir variables CSS).
- **No Inline Styles**: Evita el uso del atributo `style` a menos que sea para valores dinámicos calculados (ej. posiciones de animaciones).