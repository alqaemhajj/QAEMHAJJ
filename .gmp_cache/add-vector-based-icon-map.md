# Add a Vector-Based Icon to a Map

A
[`Symbol`](https://developers.google.com/maps/documentation/javascript/reference#Symbol)
is a vector-based icon that can be displayed on a
[`Polyline`](https://developers.google.com/maps/documentation/javascript/shapes#polylines)
or a
[`Marker`](https://developers.google.com/maps/documentation/javascript/markers)
object. For
[`AdvancedMarkerElement`](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview),
vector-based icons are rendered by appending an inline
[`SVG`](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/svg) XML
element directly to the marker.

## Prerequisites

-   **Add a customizable, interactive map to a web page or mobile app.** Ensure
    you have an initialized `google.maps.Map` instance (with a `mapId`
    configured if using `AdvancedMarkerElement`).

--------------------------------------------------------------------------------

## 1. Add a Vector Icon to an `AdvancedMarkerElement`

To display a custom vector-based icon on an `AdvancedMarkerElement`, parse an
inline SVG string using `DOMParser` and append the resulting SVG element to the
marker.

### Vanilla JavaScript / TypeScript

```typescript
async function initMap(): Promise<void> {
  const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

  const map = new Map(document.getElementById("map") as HTMLElement, {
    center: { lat: 37.42475, lng: -122.094 },
    zoom: 14,
    mapId: "DEMO_MAP_ID",
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  const parser = new DOMParser();

  // Define a custom inline SVG string.
  const pinSvgString =
    '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none">' +
    '<rect width="56" height="56" rx="28" fill="#7837FF"></rect>' +
    '<path d="M28 39L26.8725 37.9904C24.9292 36.226 23.325 34.7026 22.06 33.4202C20.795 32.1378 19.7867 30.9918 19.035 29.9823C18.2833 28.9727 17.7562 28.0587 17.4537 27.2401C17.1512 26.4216 17 25.5939 17 24.7572C17 23.1201 17.5546 21.7513 18.6638 20.6508C19.7729 19.5502 21.1433 19 22.775 19C23.82 19 24.7871 19.2456 25.6762 19.7367C26.5654 20.2278 27.34 20.9372 28 21.8649C28.77 20.8827 29.5858 20.1596 30.4475 19.6958C31.3092 19.2319 32.235 19 33.225 19C34.8567 19 36.2271 19.5502 37.3362 20.6508C38.4454 21.7513 39 23.1201 39 24.7572C39 25.5939 38.8488 26.4216 38.5463 27.2401C38.2438 28.0587 37.7167 28.9727 36.965 29.9823C36.2133 30.9918 35.205 32.1378 33.94 33.4202C32.675 34.7026 31.0708 36.226 29.1275 37.9904L28 39Z" fill="#FF7878"></path>' +
    '</svg>';

  const pinSvg = parser.parseFromString(
    pinSvgString,
    "image/svg+xml"
  ).documentElement;

  const pinSvgMarker = new AdvancedMarkerElement({
    map,
    position: { lat: 37.42475, lng: -122.094 },
    title: "A marker using a custom SVG image.",
  });

  pinSvgMarker.append(pinSvg);
}

initMap();
```

### React (`@vis.gl/react-google-maps`)

When using `@vis.gl/react-google-maps`, pass a custom SVG React component as a
child to `<AdvancedMarker>`.

*Source pattern:
[examples/advanced-marker/icons/real-estate-icon.tsx](https://github.com/visgl/react-google-maps/blob/HEAD/examples/advanced-marker/icons/real-estate-icon.tsx?utm_campaign=gmp_git_agentskills_v1)*

```tsx
import React from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';

const CustomSvgIcon = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15 30C23.2843 30 30 23.2842 30 15C30 6.7157 23.2843 0 15 0C6.71578 0 0 6.7157 0 15C0 23.2842 6.71578 30 15 30Z"
      fill="#B88B2E"
    />
    <path
      d="M10 20.75V13.8875L7.9 15.5L7 14.3L15.25 8L18.25 10.2875V8.75H20.5V12.0125L23.5 14.3L22.6 15.5L20.5 13.8875V20.75H16V16.25H14.5V20.75H10Z"
      fill="white"
    />
  </svg>
);

export const App = () => (
  <APIProvider apiKey={process.env.GOOGLE_MAPS_API_KEY as string}>
    <Map
      defaultZoom={14}
      defaultCenter={{ lat: 37.42475, lng: -122.094 }}
      mapId="DEMO_MAP_ID"
      internalUsageAttributionIds={['gmp_git_agentskills_v1']}>
      <AdvancedMarker position={{ lat: 37.42475, lng: -122.094 }}>
        <CustomSvgIcon />
      </AdvancedMarker>
    </Map>
  </APIProvider>
);
```

--------------------------------------------------------------------------------

## 2. Configure `google.maps.Symbol` Properties

When defining a `Symbol` object for a `Polyline` or legacy `Marker`, only `path`
is required. Default behaviors vary slightly depending on whether the symbol is
attached to a marker or a polyline.

| Property            | Type                    | Description & Defaults                                    |
| :------------------ | :---------------------- | :-------------------------------------------------------- |
| **`path`**          | `google.maps.SymbolPath | Defines the shape of the symbol using a predefined        |
: *(Required)*        : | string`               : `google.maps.SymbolPath` constant or custom [SVG path     :
:                     :                         : notation](http\://www.w3.org/TR/SVG/paths.html#PathData). :
:                     :                         : **Note\:** Vector paths on a polyline must fit within a   :
:                     :                         : 22x22px square. Adjust `scale` to a fractional value      :
:                     :                         : (e.g., `0.2`) if your path points exceed this boundary.   :
| **`anchor`**        | `google.maps.Point`     | Position of the symbol relative to the marker or          |
:                     :                         : polyline. Coordinates of the path are translated left and :
:                     :                         : up by the anchor's `x` and `y` coordinates. Default\:     :
:                     :                         : `(0, 0)`.                                                 :
| **`fillColor`**     | `string`                | CSS3 color of the symbol's fill (excluding extended named |
:                     :                         : colors). Default\: `'black'` on markers; polyline's       :
:                     :                         : `strokeColor` on polylines.                               :
| **`fillOpacity`**   | `number`                | Relative opacity of the fill from `0.0` (transparent) to  |
:                     :                         : `1.0` (opaque). Default\: `0.0`.                          :
| **`rotation`**      | `number`                | Clockwise rotation angle in degrees. Default: `0` on      |
:                     :                         : markers; angle of the edge on polylines. Setting          :
:                     :                         : `rotation` on a polyline fixes its orientation so it no   :
:                     :                         : longer follows the curve of the line.                     :
| **`scale`**         | `number`                | Amount by which the symbol is scaled. Default: `1` on     |
:                     :                         : markers (can scale to any size); polyline's               :
:                     :                         : `strokeWeight` on polylines (must fit within a 22x22px    :
:                     :                         : square centered at the anchor after scaling).             :
| **`strokeColor`**   | `string`                | CSS3 color of the symbol's outline. Default: `'black'` on |
:                     :                         : markers; polyline's `strokeColor` on polylines.           :
| **`strokeOpacity`** | `number`                | Relative opacity of the outline (`0.0` to `1.0`).         |
:                     :                         : Default\: `1.0` on markers; polyline's `strokeOpacity` on :
:                     :                         : polylines.                                                :
| **`strokeWeight`**  | `number`                | Weight of the symbol's outline. Default: the `scale` of   |
:                     :                         : the symbol.                                               :

### Predefined Symbols (`google.maps.SymbolPath`)

The Maps JavaScript API provides built-in symbols via `google.maps.SymbolPath`.
Forward is considered to be in the direction of the terminus of a polyline:

-   `google.maps.SymbolPath.CIRCLE`: A circle.
-   `google.maps.SymbolPath.BACKWARD_CLOSED_ARROW`: A backward-pointing arrow
    closed on all sides.
-   `google.maps.SymbolPath.FORWARD_CLOSED_ARROW`: A forward-pointing arrow
    closed on all sides.
-   `google.maps.SymbolPath.BACKWARD_OPEN_ARROW`: A backward-pointing arrow open
    on one side.
-   `google.maps.SymbolPath.FORWARD_OPEN_ARROW`: A forward-pointing arrow open
    on one side.

--------------------------------------------------------------------------------

## 3. Add Symbols to a Polyline

To display symbols on a polyline, populate the `icons[]` array of the
`PolylineOptions` object with one or more
[`IconSequence`](https://developers.google.com/maps/documentation/javascript/reference#IconSequence)
object literals:

-   **`icon`** *(Required)*: The `Symbol` object to render on the line.
-   **`offset`**: Distance from the start of the line at which an icon is
    rendered, expressed as a percentage of the line's length (e.g., `'50%'`) or
    in pixels (e.g., `'50px'`). Default: `'100%'`.
-   **`repeat`**: Distance between consecutive icons on the line (`'50%'` or
    `'50px'`). Specify `'0'` to disable repeating. Default: `'0'`.

> **Note:** If a polyline has `geodesic: true`, distances for `offset` and
> `repeat` are calculated in meters by default unless specified in pixels
> (`px`).

### Arrows, Dashed Lines, and Custom SVG Paths

```typescript
async function initMap(): Promise<void> {
  const { Map, Polyline, SymbolPath } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;

  const map = new Map(document.getElementById("map") as HTMLElement, {
    center: { lat: 20.291, lng: 153.027 },
    zoom: 6,
    mapTypeId: "terrain",
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  // 1. Arrow at the end of a polyline
  const arrowSymbol: google.maps.Symbol = {
    path: SymbolPath.FORWARD_CLOSED_ARROW,
  };

  new Polyline({
    path: [
      { lat: 22.291, lng: 152.027 },
      { lat: 18.291, lng: 152.027 },
    ],
    icons: [
      {
        icon: arrowSymbol,
        offset: "100%",
      },
    ],
    map,
  });

  // 2. Dashed line (Polyline strokeOpacity set to 0 with repeating opaque symbols)
  const dashSymbol: google.maps.Symbol = {
    path: "M 0,-1 0,1",
    strokeOpacity: 1,
    scale: 4,
  };

  new Polyline({
    path: [
      { lat: 22.291, lng: 153.027 },
      { lat: 18.291, lng: 153.027 },
    ],
    strokeOpacity: 0,
    icons: [
      {
        icon: dashSymbol,
        offset: "0",
        repeat: "20px",
      },
    ],
    map,
  });

  // 3. Multiple custom SVG symbols along a polyline
  const symbolOne: google.maps.Symbol = {
    path: "M -2,0 0,-2 2,0 0,2 z",
    strokeColor: "#F00",
    fillColor: "#F00",
    fillOpacity: 1,
  };

  const symbolTwo: google.maps.Symbol = {
    path: "M -1,0 A 1,1 0 0 0 -3,0 1,1 0 0 0 -1,0M 1,0 A 1,1 0 0 0 3,0 1,1 0 0 0 1,0M -3,3 Q 0,5 3,3",
    strokeColor: "#00F",
    rotation: 45,
  };

  const symbolThree: google.maps.Symbol = {
    path: "M -2,-2 2,2 M 2,-2 -2,2",
    strokeColor: "#292",
    strokeWeight: 4,
  };

  new Polyline({
    path: [
      { lat: 22.291, lng: 154.027 },
      { lat: 18.291, lng: 154.027 },
    ],
    icons: [
      { icon: symbolOne, offset: "0%" },
      { icon: symbolTwo, offset: "50%" },
      { icon: symbolThree, offset: "100%" },
    ],
    map,
  });
}

initMap();
```

--------------------------------------------------------------------------------

## 4. Animate a Symbol Along a Path

You can animate a symbol along a polyline by using `window.setInterval()` to
update the `offset` of the `IconSequence` at fixed intervals, and calling
`line.set("icons", icons)`. Always store the interval ID so it can be cleared
with `window.clearInterval()` during component teardown or reset.

```typescript
let animationTimerId: number | undefined;

async function initMap(): Promise<void> {
  const { Map, Polyline, SymbolPath } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;

  const map = new Map(document.getElementById("map") as HTMLElement, {
    center: { lat: 20.291, lng: 153.027 },
    zoom: 6,
    mapTypeId: "terrain",
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  const lineSymbol: google.maps.Symbol = {
    path: SymbolPath.CIRCLE,
    scale: 8,
    strokeColor: "#393",
  };

  const line = new Polyline({
    path: [
      { lat: 22.291, lng: 153.027 },
      { lat: 18.291, lng: 153.027 },
    ],
    icons: [
      {
        icon: lineSymbol,
        offset: "100%",
      },
    ],
    map,
  });

  animateCircle(line);
}

function animateCircle(line: google.maps.Polyline): void {
  if (animationTimerId !== undefined) {
    window.clearInterval(animationTimerId);
  }

  let count = 0;
  animationTimerId = window.setInterval(() => {
    count = (count + 1) % 200;

    const icons = line.get("icons");
    icons[0].offset = count / 2 + "%";
    line.set("icons", icons);
  }, 20);
}

initMap();
```
