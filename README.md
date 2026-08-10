# kickr-route

`kickr-route` is a fully client-side indoor cycling dashboard. Load a GPX route, connect a
standard Bluetooth FTMS trainer such as a compatible Wahoo KICKR, and ride the route with live
map progress, elevation, grade control, and in-memory ride statistics.

There is no backend, account, or ride database.

## Browser requirements

- Current Chrome or Edge with Web Bluetooth and WebGL2 on a compatible desktop or Android device
- HTTPS in production; `http://localhost` is treated as a secure context for development
- Bluetooth enabled and permission to discover nearby devices

Safari, Firefox, iOS browsers, and platforms without Web Bluetooth cannot connect to a physical
trainer. Demo trainer mode remains available.

## Local development

Angular 22 requires Node.js `^22.22.3`, `^24.15.0`, or `>=26`. This project and its deployment
workflow use Node 24.

```bash
npm ci
npm start
```

Open `http://localhost:4200/`.

Quality commands:

```bash
npm run format:check
npm run lint
npm test -- --watch=false
npm run typecheck
npm run build
```

The production output is written to `dist/kickr-route/browser` with the GitHub Pages base path
`/kickr-route/`.

## Using the app

1. Select **Load GPX** and choose a local `.gpx` file.
2. Select **Connect trainer** and choose a trainer exposing the Bluetooth Fitness Machine Service.
3. Check the connection and grade-control status. A trainer may provide telemetry without allowing
   simulation grade control.
4. Select **Start ride**. Use **Pause**, **Resume**, and **Finish** as needed.
5. Review the summary. It is discarded when the page is refreshed or closed.

The latest valid GPX source is saved in browser `localStorage` and restored on the next visit.
Select **Forget route** to remove it. Storage errors do not prevent an in-memory ride.

## Demo trainer

Load a route and select **Use demo trainer**. The demo emits realistic speed, cadence, and power
values and responds to route gradients through the same trainer and ride state used by real
hardware. It is intended for development, browser testing, and trying the app without a trainer.

## FTMS behavior and limitations

- Only standardized Bluetooth FTMS services and commands are used. No proprietary Wahoo protocol
  is implemented.
- Indoor Bike Data fields are conditional. The app uses instantaneous speed, cadence, and power
  when the trainer includes them.
- Route distance is calculated by integrating instantaneous speed over active ride time. This
  matches the KICKR CORE 2, which does not advertise or transmit FTMS Total Distance.
- Grade control requires the Fitness Machine Control Point and Indoor Bike Simulation Parameters
  feature. Unsupported trainers remain usable for telemetry.
- Connected KICKR CORE 2 trainers expose a signed wind control from `-50` to `+50 km/h`. Positive
  values are headwind and negative values are tailwind. Aero (`0.30 kg/m`), Road (`0.51 kg/m`), and
  Upright (`0.70 kg/m`) posture presets provide approximate wind-resistance coefficients; they do
  not represent rider weight.
- Simulation grade is currently clamped to `-10%` through `15%`, rate-limited, and sent only after
  requesting control and issuing Start/Resume.
- The app attempts to return the trainer to neutral grade when pausing, finishing, or deliberately
  disconnecting. Browsers cannot guarantee that a final Bluetooth write completes during abrupt
  tab closure, power loss, or an unexpected radio disconnect.
- FTMS feature reporting and control sequencing can vary by trainer model and firmware. Physical
  KICKR validation is still required.

## Map behavior

- MapLibre GL is loaded only after a route map is shown. Street, Satellite, and 3D are explicit map
  buttons; 3D combines with either basemap.
- Street mode uses the OpenFreeMap Liberty vector style and OpenStreetMap-derived data.
- Satellite mode uses the `ch.swisstopo.images-swissimage` WMS from swisstopo. Coverage is limited
  to Switzerland and nearby published imagery, so areas outside coverage may be blank.
- 3D mode uses Mapterhorn terrain at natural scale and OpenFreeMap building heights where present.
- North-up and Heading-up are independent from Auto-follow. Heading is calculated from the GPX
  route ahead of the rider rather than from device location or compass sensors.
- Map data services are provided on a best-effort basis. Route tracking and the elevation profile
  continue if one or more map sources are unavailable.

## GitHub Pages deployment

The workflow at `.github/workflows/deploy-pages.yml` checks, builds, and deploys pushes to `main`.
It is already configured for the repository URL path `/kickr-route/`.

To enable deployment:

1. Push the repository to GitHub with the repository name `kickr-route`.
2. Open the repository on GitHub.
3. Select **Settings**, then **Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Push to `main`, or open **Actions**, choose **Deploy to GitHub Pages**, and select **Run workflow**.
6. Wait for the `github-pages` environment deployment to complete.
7. Open `https://<github-user>.github.io/kickr-route/`.

No repository settings, deployment, commit, or push is performed by the application setup itself.

## Privacy

GPX parsing, trainer telemetry, progress, and statistics stay in the browser. The app does not send
routes or ride data to an application server. Only the latest GPX route is persisted locally; live
telemetry and ride summaries remain memory-only. Clearing site data removes the saved route.

The map makes direct requests to OpenFreeMap, swisstopo, and Mapterhorn when their corresponding
views are active. Each provider receives normal browser request metadata such as IP address and
referrer. Required source credits are displayed by the map attribution control.
