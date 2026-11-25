# Forma

Forma is a browser editor for PowerPoint presentations, with a desktop-style ribbon, native 3D models, and Morph transitions. Open the editor to see a two-slide 3D example. Your files are processed in the browser, and the most recent guest session is saved in IndexedDB on this device.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local address Vite prints, typically [localhost:5173](http://127.0.0.1:5173), and choose **Open Editor**. Use a browser with WebGL 2 for live 3D rendering.

1. Use **File → Open PPTX** to import a deck, or start a blank presentation.
2. Right-click a slide thumbnail to add, duplicate, move, or delete slides. Right-click an object or blank space on a slide for the available editing actions. Use Shift-click to select multiple objects, then align or distribute them from **Home**.
3. Use **Insert** for text, shapes, pictures, and 3D models. In **3D Model → Rotate in 3D**, drag the model freely or grab an X, Y, or Z ring to constrain rotation to that model axis. Scroll over the model or use the on-canvas buttons to zoom around its center. The editing hitbox stays compact when you zoom in and shrinks with the model when you zoom out. Thumbnails, presentations, and Morph copies reflect the saved zoom and pose. Hold Shift to snap to 15° steps. Press Escape to cancel a drag.
4. Click **Morph** in the top bar to duplicate the slide and apply Morph. Change the model's pose or zoom, then use **Transitions → Preview Transition**. During a presentation, click the right half to advance and the left half to go back. Going back plays Morph in reverse. Click **Export PPTX** to download the edited deck. PowerPoint receives the zoom as a centered resize of the native 3D object.

Use **Draw** for freehand strokes, **Design** for solid backgrounds, and **View** for the slide sorter, gridlines, and guides. On smaller windows, **Insert → More Insert** shows the commands that move out of the ribbon. Open **File → Options** or right-click the ribbon to customize tab visibility and the Quick Access Toolbar. Options are saved in this browser. **Help** lists shortcuts.

Select an object and use **Animations → All animations** to pick an entrance, emphasis, exit, or motion path. Use **Add Animation** to stack effects. The **Animation Pane** shows their order and lets you reorder or remove effects created in Forma. Use the ribbon to set the start, duration, and delay. Supported imported animations play in the browser and retain their original PowerPoint timing XML.

**Preview Transition** plays from the previous visible slide in the editor. Use **Stop Preview** or Escape to interrupt it. **Preview Animations** plays the current slide and waits for clicks on the slide at each click step. Click **Stop Preview** to return to editing. **Preview Settings** on either ribbon tab controls playback speed and whether animation previews wait for clicks.

**Home** includes layout presets for new slides, a Format Painter for text boxes and shapes, and font and paragraph formatting for the selected text box. Use **Arrange** to order, rotate, and align objects. **Shape styles** includes fill presets, outline styles, and custom colors.

Highlight text inside a text box and use the font-size buttons in **Home** to resize those characters while keeping them selected. Edited text wraps at its current size. Drag objects to snap their edges and centers to other objects or the slide. Hold **Alt/Option** to bypass snapping, or toggle **View → Smart Guides**. Select multiple objects and use **Alignment reference** to align them with each other or with the slide.

Objects can extend into the gray editing area or sit fully outside the slide. Zoom out to make more room for dragging. The slide show displays only what falls within the slide, and Morph can move off-slide objects into view.

Double-click a picture or choose **Picture Format → Crop Picture**. Drag a handle to change the crop or drag inside the frame to reposition the image. Press **Enter** or click outside to apply the crop. Press **Escape** to cancel or use **Reset crop** to show the full image again. The PPTX retains the original image and an editable crop.

## What PowerPoint receives

Exports embed a GLB, a native 3D graphic frame, and a PNG fallback for each pose. Morph uses the PowerPoint transition extension and stable object names. The browser preview approximates playback. Arbitrary camera and lighting settings on imported Office models are preserved, with editing available for native models created by Forma. Forma accepts GLB, glTF, FBX, OBJ, and STL. Use **Insert → Insert 3D** to open a stand-alone model or a ZIP, or **Insert → Model Folder** to select an extracted folder with textures and companion files. Include the glTF `.bin` or OBJ `.mtl` files where applicable. Each import allows up to 100 MB of model and companion files. Non-GLB models are converted locally to an embedded GLB, with large textures downsampled to fit. FBX material conversion is approximate and reports unresolved texture filenames. Direct GLB imports must be self-contained and use supported texture and mesh encodings.

Draw exports editable freeform shapes. Text formatting, solid backgrounds, and alt text are written to the native slide parts. The original PPTX is the basis for export. An untouched deck returns the same bytes, except when upgrading native models written by older Forma exports. Re-export those decks to correct their rotations and lighting while retaining the original models, fallback images, and Morph transitions. Edits preserve unrelated slide parts and original PowerPoint metadata. Forma reads theme fonts, inherited alignment, line spacing, bullets, and styled runs, including highlights. The browser uses installed fonts when available. Fonts, effects, and 3D shading can still render differently between the browser and PowerPoint. [Microsoft Aptos Fonts for local installation](https://www.microsoft.com/en-us/download/details.aspx?id=106087)

### Review large models before export

Forma checks the embedded GLB size, triangle count, mesh parts, and textures before exporting. Its warning thresholds are based on Microsoft's mid-range Office performance guidance. The 100 MB import limit applies to files Forma can accept. PowerPoint playback depends on hardware and model complexity. [Microsoft 3D Content Guidelines](https://download.microsoft.com/download/2/3/D/23DD4147-99A5-4CF9-B320-7A0CDE7B2E4C/3D_Content_Guidelines_for_Microsoft.pdf)

When **Try smaller textures** is available, Forma tries reducing eligible embedded textures to 1024 pixels on their longest side. Review the savings and remaining warnings, then choose **Export with smaller textures** to download a separate PPTX with native 3D and Morph intact. The workspace retains the original model. Dense meshes still need a lower-poly version to reduce the cost of rendering their geometry.

### Attach missing textures

Select the existing model and click **Add Texture Folder** in the Object panel. If Forma asks for the original model, choose the original FBX, OBJ, glTF, or model ZIP. It uses the source model's material references and UV coordinates, then embeds the textures in the GLB for PowerPoint. It keeps the model's position and pose and also updates slides that share that model. A folder with both the source model and textures works in one step. Unmatched filenames remain listed in the Object panel.


The automated checks cover package structure and browser behavior. Exact Microsoft PowerPoint playback and desktop editability require separate verification.

### Check in PowerPoint for the web

Upload an exported copy to OneDrive or SharePoint, then open it in PowerPoint for the web. Check that the file opens, the slide order is correct, and the two model poses appear in the slide show. Check Morph between the slides in an account and file location that support Morph. Save a separate copy and confirm that reopening it retains the model and slide content. Web availability varies by account and by feature. [Microsoft’s Morph guidance](https://support.microsoft.com/en-us/powerpoint/training/use-the-morph-transition-in-powerpoint)

If desktop PowerPoint is available, open the same export and check for repair prompts. Select the model and verify that PowerPoint exposes its 3D controls. Run the slide show and verify that Morph animates the model between both poses.

## Development checks

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Set `FORMA_OFFICE_FIXTURE` to the path of the [PowerPoint-authored 3D test deck](https://github.com/shbernal/pptx-ts/blob/main/test/read/fixtures/model3d.pptx) when running the browser tests to include the Office fixture round trip.

Package format references include Microsoft's [DrawingML 3D model schema](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/6c414e62-4825-4100-9ca1-88fefc5fb699) and [PowerPoint transition extensions](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx/22ebe6b5-2ade-43d9-977a-98fa194725c2).

## Present and collaborate

Use **Slide Show → Rehearse Timings** to record how long you spend on each slide, then save those timings into the PPTX. Use **Custom Slide Shows** to save and present ordered subsets, or **Presenter View** to open private notes, the upcoming slide, and the timer in another window. **Record** puts narration or an MP4 camera recording on the current slide. Camera recording needs browser support for MP4, and your browser requests camera and microphone access when you start.

Use **File → Print / Save PDF** for slides, three-slide handouts, or speaker notes. In the browser print dialog, select **Save as PDF** for a PDF file. **Save Template** downloads a PowerPoint `.potx`. **File → Automation** can make slides from CSV, apply JSON recipes to the deck, and export saved custom shows as a ZIP of separate PPTX files. **Review → Check Accessibility** shows missing descriptions and the slide’s object reading order.

1. Open **Collaborate → Create Room** and copy the random room code.
2. Send the code yourself. Everyone opens the same Forma server, chooses **Collaborate → Join Room**, and pastes it.
3. Edits sync over WebSockets. Use **Version History** to save or restore a named version for everyone. Use the comment tools to reply or resolve a thread.

Use the Vite development server for local testing. To serve Forma with the relay in production, run `npm ci`, `npm run build`, and `npm start` on the same machine. The server listens on port 4173 by default. For access across devices, serve it behind HTTPS and forward WebSocket upgrades on `/forma-rooms`, preserving the Host header. Everyone uses the resulting HTTPS address. Static hosting alone has no collaboration relay.

Rooms have no accounts. The code grants editing access to the shared presentation. The relay keeps rooms and their saved versions in memory. A room expires after 30 minutes with nobody connected, and a server restart clears the rooms. A shared deck can use up to 65 MiB of binary data, including its source file and loaded media. Export a PPTX or keep a local copy to save the shared work.

## Accounts and cloud decks

Forma opens at `/`. The editor at `/editor` supports importing, editing, exporting, and local recovery without an account. The latest local deck stays in the browser. Sign in and choose **Save to My Decks** to store a copy in your account, or create and import directly from **My Decks**. Cloud decks autosave while you edit and have a private Trash you can restore from.

### Configure the backend

1. Create a Supabase project and apply the migration in [supabase/migrations](supabase/migrations), using the Supabase CLI or SQL Editor. The migration creates the private library and the private `forma-parts` bucket with ownership policies.
2. Configure [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [Microsoft Azure](https://supabase.com/docs/guides/auth/social-sign-in/auth-azure) in Supabase Auth. For Microsoft, register an app that supports personal, work, and school accounts, and configure the email verification claims described in the Azure guide. Use the provider callback URL shown by Supabase when configuring Google Cloud and Microsoft Entra. Store the provider client secrets in Supabase.
3. Set **Site URL** in Supabase Auth to the public HTTPS address of Forma. Add that address with `/auth/callback` to **Redirect URLs**. For development, also add `http://127.0.0.1:5173/auth/callback` if that is your Vite address.
4. Copy [.env.example](.env.example) to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the project URL and publishable key. Vite includes these values in the frontend build. Keep private keys and provider secrets out of the frontend environment.
5. Run `npm run build` and `npm start` to serve the home page, callback, and editor routes from the existing Node server. In production proxy HTTPS and WebSocket upgrades to the same server. Run a separate Supabase project for staging if you need to test both OAuth providers before changing production settings.

Cloud projects keep the source PPTX, editable slide data, and media. Save failures keep pending changes on the device when browser storage is available. If a second session saves first, use **Save a Copy** or **Reload Cloud Version**. Starting or joining a room from a cloud deck opens a temporary workspace. Use **Save a Copy to My Decks** to keep the shared result in your account. Moving a deck to Trash retains its files for restore.

To exercise cloud workflows locally without a Supabase project, run the browser test with the mock service configuration.

```sh
VITE_SUPABASE_URL=https://forma-test.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=mock-publishable-key \
npm run test:e2e -- tests/cloud.spec.ts
```
