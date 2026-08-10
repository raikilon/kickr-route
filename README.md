# kickr-route

Ride GPX routes indoors with live trainer resistance, route progress, maps, and elevation data.
Everything runs directly in the browser.

[Open kickr-route](https://raikilon.github.io/kickr-route/)

## What it does

- Loads GPX tracks and routes from your device.
- Connects to compatible Bluetooth FTMS indoor trainers, including Wahoo KICKR models.
- Adjusts trainer resistance from the route gradient.
- Tracks speed, cadence, power, distance, and riding time.
- Shows completed and remaining route sections on an interactive map.
- Displays a zoomable elevation profile with gradient difficulty and distance markers.
- Provides an end-of-ride summary.

## How to use it

1. Open the app in Chrome or Edge on a Bluetooth-compatible desktop or Android device.
2. Load a GPX route.
3. Connect your trainer.
4. Start riding.

The latest route is kept in your browser so it can be restored on your next visit. Use **Forget
route** to remove it.

## Trainer compatibility

Physical trainer connections require Web Bluetooth, which is available in current Chrome and Edge
on supported platforms. The trainer must expose the standard Bluetooth Fitness Machine Service.
Available telemetry and resistance control depend on the trainer and its firmware.

## Demo trainer

Demo mode is intentionally hidden from the main app. To try kickr-route without a physical trainer,
open the [test route](https://raikilon.github.io/kickr-route/test/), load a GPX file, and select
**Use demo trainer**.

For local testing, open `http://localhost:4200/test` after starting the app.

## Development

kickr-route is built with Angular 22 and requires Node.js 24.

Install dependencies and start the development server:

```bash
npm ci
npm start
```

Create a production build:

```bash
npm run build
```

The local app is available at `http://localhost:4200/`.

## Privacy

GPX parsing, trainer telemetry, ride progress, and statistics stay in your browser. There is no
account, backend, or ride database. The app contacts external map providers to display map imagery,
terrain, and street data; those providers receive normal web request information such as your IP
address.
