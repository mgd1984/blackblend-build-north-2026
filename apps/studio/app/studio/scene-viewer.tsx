"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { optimizeNativeAssembly, setInspectionMaterial } from "../../lib/native-assembly";
import { animationPose, type SceneDocument } from "../../lib/scene-document";
import { encodeCanvasMp4 } from "../../lib/browser-previs";
import OrientationGizmo, { type OrientationHandle } from "./orientation-gizmo";
import {
  cameraFov,
  cameraSpan,
  cameraProjection,
  fitCamera,
  fitAnimationCamera,
  presetCamera,
  type ViewPreset,
} from "../../lib/scene-camera";

export type ViewerHandle = {
  capture: (document: SceneDocument, onProgress: (value: number) => void) => Promise<Blob>;
  camera: () => SceneDocument["camera"];
  screenshot: () => string;
  focus: (id?: string) => void;
  view: (preset: ViewPreset) => void;
  resetView: () => void;
  fitAnimation: () => void;
};
type Props = {
  document: SceneDocument;
  selected: string | null;
  explode: number;
  playing: boolean;
  locked: boolean;
  progress: number;
  xray: boolean;
  edges: boolean;
  navigation: "orbit" | "pan";
  onSelect: (id: string | null) => void;
  onProgress: (value: number) => void;
  onEnded: () => void;
  onStatus: (value: string) => void;
  onCamera: (value: SceneDocument["camera"]) => void;
};
type Part = {
  shape: SceneDocument["parts"][number]["shape"];
  object: THREE.Object3D;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  size: THREE.Vector3;
  color: string;
  bounds: THREE.Box3;
};

export default forwardRef<ViewerHandle, Props>(function SceneViewer(props, ref) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  const api = useRef<ViewerHandle | null>(null);
  const orienter = useRef<OrientationHandle>(null);
  const openedCamera = useRef({
    asset: props.document.asset,
    camera: structuredClone(props.document.camera),
  });
  if (openedCamera.current.asset !== props.document.asset)
    openedCamera.current = {
      asset: props.document.asset,
      camera: structuredClone(props.document.camera),
    };
  const geometryId = props.document.geometry?.id;
  latest.current = props;
  useImperativeHandle(
    ref,
    () => ({
      capture: (document, progress) => {
        if (!api.current) throw Error("The scene is still loading.");
        return api.current.capture(document, progress);
      },
      camera: () => {
        if (!api.current) throw Error("The scene is still loading.");
        return api.current.camera();
      },
      screenshot: () => api.current?.screenshot() ?? "",
      focus: (id) => api.current?.focus(id),
      view: (preset) => api.current?.view(preset),
      resetView: () => api.current?.resetView(),
      fitAnimation: () => api.current?.fitAnimation(),
    }),
    [],
  );
  useEffect(() => {
    if (!host.current) return;
    let stopped = false,
      frame = 0,
      model: THREE.Object3D | null = null,
      loadError = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch {
      latest.current.onStatus("WebGL is unavailable. Try a browser with hardware acceleration.");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.setAttribute(
      "aria-label",
      latest.current.document.title + ". Drag to orbit, scroll to zoom, click a part to select.",
    );
    renderer.domElement.tabIndex = 0;
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const wireSurface = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const wireXray = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = new THREE.PerspectiveCamera(
      38,
      1,
      0.001,
      500,
    );
    let aspect = 1,
      orthoSpan = 1,
      settingCamera = false,
      interacting = false,
      pendingCamera = false,
      lastViewOrbit = 0;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 0.02;
    controls.maxDistance = 200;
    controls.minPolarAngle = THREE.MathUtils.degToRad(0.5);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(179.5);
    controls.zoomToCursor = true;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    scene.add(new THREE.HemisphereLight(0xf0f2e8, 0x454943, 1.5));
    const key = new THREE.DirectionalLight(0xfff4dd, 2.4);
    key.position.set(-6, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.normalBias = 0.025;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc4d2ed, 1.1);
    fill.position.set(6, 4, -7);
    scene.add(fill);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x111516,
      roughness: 0.96,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    scene.add(ground);
    const parts = new Map<string, Part>(),
      objects = new Map<THREE.Object3D, string>();
    const outline = new THREE.BoxHelper(new THREE.Object3D(), 0xd6edaa);
    outline.visible = false;
    scene.add(outline);
    let edgeObjects: THREE.LineSegments[] = [];
    let lastCamera = "",
      playStart = 0,
      wasPlaying = false,
      recording: {
        started: number;
        duration: number;
        recorder?: MediaRecorder;
        document: SceneDocument;
        deterministic: boolean;
        onProgress: (n: number) => void;
      } | null = null;
    let forceRender = true,
      lastDraw = 0,
      previousProps: Props | null = null;
    const updateProjection = () => {
      if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
      else {
        camera.left = (-orthoSpan * aspect) / 2;
        camera.right = (orthoSpan * aspect) / 2;
        camera.top = orthoSpan / 2;
        camera.bottom = -orthoSpan / 2;
      }
      camera.updateProjectionMatrix();
    };
    const resize = () => {
      if (recording) return;
      const rect = host.current?.getBoundingClientRect();
      if (!rect || rect.width <= 1 || rect.height <= 1) return;
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      // Resizing changes the aspect ratio, not the saved camera. Keep that camera
      // when Preview, Apply or Undo loads another model version.
      aspect = rect.width / Math.max(1, rect.height);
      updateProjection();
      forceRender = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    const setCamera = (settings: SceneDocument["camera"], orbit = 0) => {
      settingCamera = true;
      // Stop leftover camera motion before setting a new position or projection.
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      if ((settings.projection === "orthographic") !== camera instanceof THREE.OrthographicCamera) {
        camera =
          settings.projection === "orthographic"
            ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 500)
            : new THREE.PerspectiveCamera(cameraFov(settings), aspect, 0.001, 500);
        controls.object = camera;
      }
      if (camera instanceof THREE.PerspectiveCamera) camera.fov = cameraFov(settings);
      orthoSpan = cameraSpan(settings);
      camera.zoom = 1;
      updateProjection();
      controls.minZoom = orthoSpan / 500;
      controls.maxZoom = orthoSpan / 0.002;
      const yaw = THREE.MathUtils.degToRad(settings.yaw + orbit),
        elevation = THREE.MathUtils.degToRad(settings.elevation),
        target = new THREE.Vector3(...settings.target);
      controls.target.copy(target);
      camera.position.set(
        target.x + settings.radius * Math.sin(yaw) * Math.cos(elevation),
        target.y + settings.radius * Math.sin(elevation),
        target.z + settings.radius * Math.cos(yaw) * Math.cos(elevation),
      );
      camera.lookAt(target);
      controls.update();
      controls.enableDamping = damping;
      settingCamera = false;
      lastViewOrbit = orbit;
    };
    const readCamera = (): SceneDocument["camera"] => {
      const delta = camera.position.clone().sub(controls.target),
        r = delta.length();
      return {
        ...latest.current.document.camera,
        // Store the base pose; the timeline adds its orbit when evaluated.
        yaw: THREE.MathUtils.radToDeg(Math.atan2(delta.x, delta.z)) - lastViewOrbit,
        elevation: Math.max(
          -89.5,
          Math.min(
            89.5,
            THREE.MathUtils.radToDeg(
              Math.asin(Math.max(-1, Math.min(1, delta.y / Math.max(r, 0.00001)))),
            ),
          ),
        ),
        radius: Math.max(0.02, Math.min(200, r)),
        target: controls.target.toArray(),
        projection: camera instanceof THREE.OrthographicCamera ? "orthographic" : "perspective",
        ...(camera instanceof THREE.OrthographicCamera
          ? { orthoScale: Math.max(0.002, Math.min(500, orthoSpan / camera.zoom)) }
          : { fov: camera.fov }),
      };
    };
    const publishCamera = () => {
      const next = readCamera();
      lastCamera = JSON.stringify(next);
      pendingCamera = false;
      latest.current.onCamera(next);
    };
    controls.addEventListener("start", () => {
      interacting = true;
    });
    controls.addEventListener("end", () => {
      interacting = false;
    });
    controls.addEventListener("change", () => {
      if (!settingCamera && !recording && !latest.current.playing) pendingCamera = true;
    });
    function register(id: string, object: THREE.Object3D, authoredSize?: THREE.Vector3) {
      const source = latest.current.document.parts.find((p) => p.id === id);
      if (!source) return;
      object.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3(),
        inverse = object.matrixWorld.clone().invert();
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
          if (child.geometry.boundingBox)
            bounds.union(
              child.geometry.boundingBox
                .clone()
                .applyMatrix4(inverse.clone().multiply(child.matrixWorld)),
            );
          child.userData.shadedMaterials = child.material;
        }
      });
      parts.set(id, {
        bounds,
        shape: source.shape,
        object,
        position: object.position.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
        size: source.shape === "native" ? authoredSize! : new THREE.Vector3(...source.size),
        color: source.color,
      });
      object.traverse((child) => {
        objects.set(child, id);
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(child.geometry, 35),
            new THREE.LineBasicMaterial({
              color: 0x161b16,
              transparent: true,
              opacity: 0.35,
            }),
          );
          edges.userData.edge = true;
          child.add(edges);
          edgeObjects.push(edges);
        }
      });
    }
    if (props.document.asset !== "primitives") {
      latest.current.onStatus("Loading authored assembly…");
      new GLTFLoader().load(
        geometryId
          ? "/api/scene-geometry?kind=model&id=" + encodeURIComponent(geometryId)
          : "/api/scene-example?kind=model&asset=" + encodeURIComponent(props.document.asset),
        (gltf) => {
          if (stopped) {
            gltf.scene.traverse((obj) => {
              if (obj instanceof THREE.Mesh) obj.geometry.dispose();
            });
            return;
          }
          model = gltf.scene;
          forceRender = true;
          scene.add(model);
          model.updateMatrixWorld(true);
          const nodes: THREE.Object3D[] = [];
          model.traverse((node) => {
            if (node.userData.blackblend_part_id) nodes.push(node);
          });
          for (const node of nodes) {
            const authoredSize = optimizeNativeAssembly(node);
            register(node.userData.blackblend_part_id, node, authoredSize);
          }
          if (
            [...parts.values()].filter((part) => part.shape === "native").length !==
            latest.current.document.parts.filter((p) => p.shape === "native").length
          ) {
            loadError = true;
            latest.current.onStatus(
              "Some source parts are unavailable. Re-export the source model before editing.",
            );
          } else {
            latest.current.onStatus(
              latest.current.document.title + " · " + parts.size + " assemblies",
            );
          }
        },
        undefined,
        () => {
          loadError = true;
          latest.current.onStatus(
            "The private Blender export is unavailable on this host. Open the local Studio or load the concept example.",
          );
        },
      );
    }
    function syncPrimitives() {
      const document = recording?.document ?? latest.current.document;
      for (const [id, part] of parts) {
        if (
          part.shape !== "native" &&
          !document.parts.some((p) => p.id === id && p.shape === part.shape)
        ) {
          part.object.removeFromParent();
          part.object.traverse((child) => {
            objects.delete(child);
            if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
              child.geometry.dispose();
              const material =
                child instanceof THREE.Mesh
                  ? (child.userData.shadedMaterials ?? child.material)
                  : child.material;
              (Array.isArray(material) ? material : [material]).forEach((value: THREE.Material) =>
                value.dispose(),
              );
            }
          });
          edgeObjects = edgeObjects.filter((edge) => edge.parent?.parent);
          parts.delete(id);
        }
      }
      for (const part of document.parts) {
        if (part.shape === "native") continue;
        if (parts.has(part.id)) continue;
        const geometry =
          part.shape === "cylinder"
            ? new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
            : part.shape === "sphere"
              ? new THREE.SphereGeometry(0.5, 24, 16)
              : new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
          color: part.color,
          roughness: 0.7,
          metalness: 0.05,
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        register(part.id, mesh);
      }
    }
    if (props.document.asset === "primitives") {
      syncPrimitives();
      latest.current.onStatus("Concept scene · editable parts");
    }
    const raycaster = new THREE.Raycaster();
    let down: [number, number] = [0, 0];
    const onDown = (e: PointerEvent) => {
      renderer.domElement.focus({ preventScroll: true });
      down = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 ||
        recording ||
        e.button !== 0 ||
        e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
        latest.current.navigation === "pan"
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = raycaster
        .intersectObjects(
          [...parts.values()].filter((p) => p.object.visible).map((p) => p.object),
          true,
        )
        .find((hit) => hit.object instanceof THREE.Mesh);
      let node = hit?.object;
      let id: string | undefined;
      while (node && !id) {
        id = objects.get(node);
        node = node.parent ?? undefined;
      }
      latest.current.onSelect(id ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    const onDoubleClick = () => {
      if (!recording && !latest.current.playing)
        api.current?.focus(latest.current.selected ?? undefined);
    };
    const onKey = (event: KeyboardEvent) => {
      if (recording || latest.current.playing || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      const view =
        key === "1"
          ? event.ctrlKey
            ? "back"
            : "front"
          : key === "3"
            ? event.ctrlKey
              ? "left"
              : "right"
            : key === "7"
              ? event.ctrlKey
                ? "bottom"
                : "top"
              : null;
      if (view) api.current?.view(view);
      else if (key === "5")
        applyNavigationCamera(
          cameraProjection(
            readCamera(),
            camera instanceof THREE.OrthographicCamera ? "perspective" : "orthographic",
          ),
        );
      else if (key === "f" || event.code === "NumpadDecimal")
        api.current?.focus(latest.current.selected ?? undefined);
      else if (event.key === "Home") api.current?.focus();
      else return;
      event.preventDefault();
    };
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    renderer.domElement.addEventListener("keydown", onKey);
    function applyNavigationCamera(next: SceneDocument["camera"]) {
      setCamera(next, lastViewOrbit);
      pendingCamera = false;
      lastCamera = JSON.stringify(next);
      forceRender = true;
      latest.current.onCamera(next);
    }
    const draw = (now: number, captureProgress?: number) => {
      const current = latest.current,
        doc = recording?.document ?? current.document;
      const cameraMoved = controls.update();
      if (
        !recording &&
        !current.playing &&
        !forceRender &&
        previousProps &&
        !cameraMoved &&
        previousProps.document === doc &&
        previousProps.selected === current.selected &&
        previousProps.explode === current.explode &&
        previousProps.progress === current.progress &&
        previousProps.xray === current.xray &&
        previousProps.edges === current.edges &&
        previousProps.navigation === current.navigation &&
        !pendingCamera
      )
        return;
      forceRender = false;
      previousProps = current;
      renderer.shadowMap.needsUpdate = true;
      syncPrimitives();
      let progress = captureProgress ?? current.progress;
      if (recording && !recording.deterministic) {
        progress = Math.min(1, (now - recording.started) / (recording.duration * 1000));
        recording.onProgress(progress);
      } else if (!recording && current.playing) {
        if (!wasPlaying) playStart = now - current.progress * doc.animation.duration * 1000;
        progress = Math.min(1, (now - playStart) / (doc.animation.duration * 1000));
        current.onProgress(progress);
        if (progress === 1) current.onEnded();
      }
      wasPlaying = current.playing;
      const pose = animationPose(progress),
        spread =
          (current.playing || recording || progress > 0 ? pose.explode : current.explode) *
          doc.animation.spread;
      const cameraKey = JSON.stringify(doc.camera);
      const viewOrbit = doc.camera.orbit * pose.orbit;
      if (recording || current.playing || cameraKey !== lastCamera || viewOrbit !== lastViewOrbit) {
        setCamera(doc.camera, viewOrbit);
        lastCamera = cameraKey;
      }
      controls.enabled = !recording && !current.playing;
      controls.mouseButtons.LEFT =
        current.navigation === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.touches.ONE = current.navigation === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      controls.update();
      const wireframe = doc.renderStyle === "wireframe";
      const white = wireframe || doc.background === "white";
      scene.background = new THREE.Color(white ? 0xffffff : 0x101415);
      groundMaterial.color.set(white ? 0xffffff : 0x111516);
      ground.visible = !wireframe && camera.position.y >= controls.target.y;
      renderer.shadowMap.enabled = !wireframe;
      for (const state of parts.values()) state.object.visible = false;
      for (const value of doc.parts) {
        const state = parts.get(value.id);
        if (!state) continue;
        const object = state.object;
        object.visible = value.visible;
        const offset = new THREE.Vector3(...value.position).addScaledVector(
          new THREE.Vector3(...value.explode),
          spread,
        );
        if (value.shape === "native") {
          object.position.copy(state.position).add(offset);
          object.rotation.set(
            state.rotation.x + THREE.MathUtils.degToRad(value.rotation[0]),
            state.rotation.y + THREE.MathUtils.degToRad(value.rotation[1]),
            state.rotation.z + THREE.MathUtils.degToRad(value.rotation[2]),
          );
          object.scale
            .copy(state.scale)
            .multiply(new THREE.Vector3(...value.size).divide(state.size));
        } else {
          object.position.copy(offset);
          object.rotation.set(
            ...(value.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]),
          );
          object.scale.set(...value.size);
        }
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const sourceMaterial = child.userData.shadedMaterials as
              THREE.Material | THREE.Material[];
            child.material = wireframe ? (current.xray ? wireXray : wireSurface) : sourceMaterial;
            const materials = Array.isArray(sourceMaterial) ? sourceMaterial : [sourceMaterial];
            for (const material of materials) {
              if (material instanceof THREE.MeshStandardMaterial) {
                setInspectionMaterial(material, current.xray);
                if (!material.userData.sourceColor)
                  material.userData.sourceColor = material.color.clone();
                if (value.shape !== "native" || value.color !== state.color)
                  material.color.set(value.color);
                else material.color.copy(material.userData.sourceColor);
              }
            }
          }
        });
      }
      edgeObjects.forEach((edge) => {
        edge.visible = wireframe || current.edges;
        const material = edge.material as THREE.LineBasicMaterial;
        material.color.set(wireframe ? 0x111111 : 0x161b16);
        material.opacity = wireframe ? 1 : 0.35;
        material.depthTest = !wireframe || !current.xray;
      });
      (outline.material as THREE.LineBasicMaterial).color.set(wireframe ? 0x333333 : 0xd6edaa);
      const selected = current.selected ? parts.get(current.selected) : null;
      outline.visible = !!selected && selected.object.visible && !recording;
      if (selected) outline.setFromObject(selected.object);
      // Keep depth precision at both PTZ-component and building scales.
      // A fixed sub-millimetre near plane causes distant siding to shimmer.
      if (camera instanceof THREE.PerspectiveCamera) {
        const near = Math.max(
          0.0001,
          Math.min(1, camera.position.distanceTo(controls.target) / 100),
        );
        if (camera.near !== near) {
          camera.near = near;
          camera.updateProjectionMatrix();
        }
      }
      const offset = camera.position.clone().sub(controls.target);
      orienter.current?.update(
        THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)),
        THREE.MathUtils.radToDeg(Math.asin(offset.y / Math.max(0.00001, offset.length()))),
      );
      renderer.render(scene, camera);
      // Save the settled pose, rather than snapping back to the pointer-up
      // position while damping is still moving the camera.
      if (pendingCamera && !interacting && !cameraMoved && !recording && !current.playing)
        publishCamera();
      if (
        recording &&
        !recording.deterministic &&
        progress === 1 &&
        recording.recorder?.state === "recording"
      )
        recording.recorder.stop();
    };
    const animate = (now: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(animate);
      if (recording?.deterministic || now - lastDraw < 1000 / 30) return;
      lastDraw = now;
      draw(now);
    };
    frame = requestAnimationFrame(animate);
    api.current = {
      camera: readCamera,
      screenshot: () => renderer.domElement.toDataURL("image/png"),
      view: (view) => {
        if (recording || latest.current.playing) return;
        const next = presetCamera(readCamera(), view);
        next.yaw -= lastViewOrbit;
        applyNavigationCamera(next);
      },
      resetView: () => {
        if (!recording && !latest.current.playing)
          applyNavigationCamera(openedCamera.current.camera);
      },
      fitAnimation: () => {
        if (recording || latest.current.playing) return;
        if (loadError || !parts.size) throw Error("Wait for the scene to finish loading.");
        const doc = latest.current.document;
        scene.updateMatrixWorld(true);
        const bounds = doc.parts
          .filter((value) => value.visible)
          .map((value) => {
            const state = parts.get(value.id);
            if (!state) throw Error("A visible component is still loading.");
            const position = new THREE.Vector3(...value.position),
              rotation = new THREE.Euler(),
              scale = new THREE.Vector3(...value.size);
            if (value.shape === "native") {
              position.add(state.position);
              rotation.set(
                state.rotation.x + THREE.MathUtils.degToRad(value.rotation[0]),
                state.rotation.y + THREE.MathUtils.degToRad(value.rotation[1]),
                state.rotation.z + THREE.MathUtils.degToRad(value.rotation[2]),
              );
              scale.divide(state.size).multiply(state.scale);
            } else
              rotation.set(
                ...(value.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]),
              );
            const matrix = new THREE.Matrix4().compose(
              position,
              new THREE.Quaternion().setFromEuler(rotation),
              scale,
            );
            const parent = state.object.parent?.matrixWorld ?? new THREE.Matrix4();
            const box = state.bounds.clone().applyMatrix4(parent.clone().multiply(matrix));
            // Translation is authored in the part's parent coordinates.
            const explode = new THREE.Vector3(...value.explode).applyMatrix3(
              new THREE.Matrix3().setFromMatrix4(parent),
            );
            return { min: box.min.toArray(), max: box.max.toArray(), explode: explode.toArray() };
          });
        applyNavigationCamera(
          fitAnimationCamera(readCamera(), bounds, doc.animation.spread, aspect),
        );
      },
      focus: (id) => {
        if (recording || latest.current.playing) return;
        const part = id ? parts.get(id) : null;
        if (id && (!part || !part.object.visible)) return;
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3();
        if (part) box.setFromObject(part.object);
        else
          for (const p of parts.values())
            if (p.object.visible) box.union(new THREE.Box3().setFromObject(p.object));
        if (!box.isEmpty()) {
          applyNavigationCamera(
            fitCamera(readCamera(), { min: box.min.toArray(), max: box.max.toArray() }, aspect),
          );
        }
      },
      capture: async (document, onProgress) => {
        if (recording || loadError || !parts.size)
          throw Error("Wait for the scene to finish loading.");
        // Save these exact scene settings with the exported take.
        const captureDocument = structuredClone(document);
        const seconds = captureDocument.animation.duration;
        pendingCamera = false;
        recording = {
          started: performance.now(),
          duration: seconds,
          document: captureDocument,
          deterministic: true,
          onProgress,
        };
        renderer.setPixelRatio(1);
        renderer.setSize(1280, 720, false);
        aspect = 16 / 9;
        updateProjection();
        controls.update();
        controls.enableDamping = false;
        controls.enabled = false;
        const reset = () => {
          recording?.recorder?.stream.getTracks().forEach((track) => track.stop());
          recording = null;
          if (stopped) return;
          renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
          controls.enableDamping = true;
          controls.enabled = true;
          lastCamera = "";
          forceRender = true;
          resize();
        };
        try {
          const mp4 = await encodeCanvasMp4(
            renderer.domElement,
            seconds,
            (progress) => {
              if (stopped) throw Error("The scene was closed during export.");
              draw(performance.now(), progress);
            },
            onProgress,
          );
          if (mp4) return mp4;
          if (typeof MediaRecorder === "undefined" || !renderer.domElement.captureStream)
            throw Error(
              "This browser cannot encode H.264 video. Try a current desktop Chrome, Edge or Safari browser.",
            );
          const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
            (type) => MediaRecorder.isTypeSupported(type),
          );
          if (!mime) throw Error("This browser cannot encode H.264 or WebM video.");
          return await new Promise<Blob>((resolve, reject) => {
            const stream = renderer.domElement.captureStream(24);
            const recorder = new MediaRecorder(stream, {
              mimeType: mime,
              videoBitsPerSecond: 6000000,
            });
            const chunks: BlobPart[] = [];
            recorder.ondataavailable = (event) => {
              if (event.data.size) chunks.push(event.data);
            };
            recorder.onerror = () => reject(Error("Animation recording failed."));
            recorder.onstop = () =>
              stopped
                ? reject(Error("The scene was closed during export."))
                : resolve(new Blob(chunks, { type: "video/webm" }));
            recording = {
              started: performance.now(),
              duration: seconds,
              recorder,
              document: captureDocument,
              deterministic: false,
              onProgress,
            };
            // Render the assembled first frame before the stream starts.
            draw(performance.now(), 0);
            recorder.start(200);
          });
        } finally {
          reset();
        }
      },
    };
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      if (recording?.recorder?.state === "recording") recording.recorder.stop();
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      renderer.domElement.removeEventListener("keydown", onKey);
      controls.dispose();
      outline.geometry.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry?.dispose();
          const material =
            obj instanceof THREE.Mesh
              ? (obj.userData.shadedMaterials ?? obj.material)
              : obj.material;
          const mats = Array.isArray(material) ? material : [material];
          mats.forEach((m) => m.dispose());
        }
      });
      wireSurface.dispose();
      wireXray.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
      edgeObjects = [];
    };
  }, [props.document.asset, geometryId]);
  return (
    <div className="scene-canvas" ref={host}>
      <OrientationGizmo
        ref={orienter}
        disabled={props.playing || props.locked}
        onView={(view) => api.current?.view(view)}
      />
    </div>
  );
});
