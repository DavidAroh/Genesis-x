import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Loader2, Globe, Radio, Activity, ZoomIn, Maximize2, Database, Cpu } from 'lucide-react';

const PINCH_THRESHOLD = 0.05;
const MIN_ZOOM = 1.05;
const MAX_ZOOM = 5.0;
const ZOOM_SENSITIVITY = 3.2;
const ZOOM_DAMPING = 0.88;
const LERP_FACTOR = 0.08;
const EMA_ALPHA = 0.2;

const TEXTURES = {
  diffuse: 'https://unpkg.com/three-globe/example/img/earth-dark.jpg',
  bump: 'https://unpkg.com/three-globe/example/img/earth-topology.png',
  specular: 'https://unpkg.com/three-globe/example/img/earth-water.png',
  emissive: 'https://unpkg.com/three-globe/example/img/earth-night.jpg',
  clouds: 'https://unpkg.com/three-globe/example/img/earth-clouds.png'
};

const HolographicGlobe: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaPipeCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // HUD Refs for direct DOM manipulation
  const altitudeTextRef = useRef<HTMLSpanElement>(null);
  const altitudeBarRef = useRef<HTMLDivElement>(null);
  const zoomPercentRef = useRef<HTMLDivElement>(null);
  const vectorSubsystemTextRef = useRef<HTMLSpanElement>(null);
  const trackingModeTextRef = useRef<HTMLSpanElement>(null);
  const kineticLinkDotRef = useRef<HTMLDivElement>(null);

  // Three.js Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const globeRef = useRef<THREE.Group | null>(null);
  const ringGroupRef = useRef<THREE.Group | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);
  const cloudMeshRef = useRef<THREE.Mesh | null>(null);
  const mainLightRef = useRef<THREE.SpotLight | null>(null);
  const requestRef = useRef<number | null>(null);

  // Interaction & Kinetic Refs
  const lastHandDistance = useRef<number | null>(null);
  const smoothedHandDistance = useRef<number | null>(null);
  const zoomVelocity = useRef<number>(0);
  const handPos = useRef<{ x: number; y: number } | null>(null);
  const isPinching = useRef<boolean>(false);
  const lastInteractionTime = useRef<number>(Date.now());
  const targetZoom = useRef<number>(3.5);
  const currentAltitudeRef = useRef<number>(3500);
  const isComponentMounted = useRef<boolean>(true);

  // State
  const [loading, setLoading] = useState(true);

  const initThree = useCallback(() => {
    if (!threeCanvasRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8); // Explicitly center camera
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: threeCanvasRef.current,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    rendererRef.current = renderer;

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeRef.current = globeGroup;

    const loader = new THREE.TextureLoader();
    const diffuseMap = loader.load(TEXTURES.diffuse);
    const bumpMap = loader.load(TEXTURES.bump);
    const specularMap = loader.load(TEXTURES.specular);
    const emissiveMap = loader.load(TEXTURES.emissive);
    const cloudMap = loader.load(TEXTURES.clouds);

    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const material = new THREE.MeshPhongMaterial({
      map: diffuseMap,
      bumpMap: bumpMap,
      bumpScale: 0.02,
      specularMap: specularMap,
      shininess: 10,
      emissiveMap: emissiveMap,
      emissive: new THREE.Color(0x00ffff),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.98
    });
    const globe = new THREE.Mesh(geometry, material);
    globeGroup.add(globe);

    const cloudGeom = new THREE.SphereGeometry(1.02, 64, 64);
    const cloudMat = new THREE.MeshPhongMaterial({
      alphaMap: cloudMap,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeom, cloudMat);
    globeGroup.add(clouds);
    cloudMeshRef.current = clouds;

    const hexGeom = new THREE.IcosahedronGeometry(1.04, 8);
    const hexMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.05
    });
    const hexMesh = new THREE.Mesh(hexGeom, hexMat);
    globeGroup.add(hexMesh);

    const atmoGeom = new THREE.SphereGeometry(1.3, 64, 64);
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x00ffff) },
        viewVector: { value: camera.position }
      },
      vertexShader: `
        varying float intensity;
        void main() {
          vec3 vNormal = normalize( normalMatrix * normal );
          vec3 vNormel = normalize( normalMatrix * vec3(0.0, 0.0, 1.0) );
          intensity = pow( 0.6 - dot(vNormal, vNormel), 4.0 );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float intensity;
        void main() {
          vec3 glow = glowColor * intensity;
          gl_FragColor = vec4( glow, intensity );
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true
    });
    const atmo = new THREE.Mesh(atmoGeom, atmoMat);
    scene.add(atmo);
    atmosphereRef.current = atmo;

    const ringGroup = new THREE.Group();
    scene.add(ringGroup);
    ringGroupRef.current = ringGroup;

    for (let i = 0; i < 4; i++) {
      const ringGeom = new THREE.TorusGeometry(1.6 + i * 0.25, 0.0015, 8, 128);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.12 - (i * 0.02)
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = Math.random() * Math.PI;
      ring.rotation.y = Math.random() * Math.PI;
      ringGroup.add(ring);
    }

    const ambientLight = new THREE.AmbientLight(0x002222, 0.8);
    scene.add(ambientLight);

    const mainLight = new THREE.SpotLight(0xffffff, 8);
    mainLight.position.set(5, 5, 10);
    mainLight.angle = 0.4;
    mainLight.penumbra = 0.5;
    scene.add(mainLight);
    mainLightRef.current = mainLight;

    const starsGeom = new THREE.BufferGeometry();
    const starsCount = 3000;
    const starsArray = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount * 3; i++) starsArray[i] = (Math.random() - 0.5) * 50;
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starsArray, 3));
    const stars = new THREE.Points(starsGeom, new THREE.PointsMaterial({ size: 0.015, color: 0x555555, transparent: true, opacity: 0.7 }));
    scene.add(stars);

    const animate = () => {
      if (!isComponentMounted.current) return;
      requestRef.current = requestAnimationFrame(animate);

      const time = Date.now();

      if (globeRef.current) {
        if (time - lastInteractionTime.current > 1500) {
          globeRef.current.rotation.y += 0.0012;
        }
        if (handPos.current && lastHandDistance.current === null) {
          const tx = (handPos.current.x - 0.5) * 0.08;
          const ty = (handPos.current.y - 0.5) * 0.08;
          globeRef.current.rotation.y += tx;
          globeRef.current.rotation.x += ty;
        }
        if (cloudMeshRef.current) {
          cloudMeshRef.current.rotation.y += 0.0004;
        }
      }

      if (ringGroupRef.current) {
        ringGroupRef.current.children.forEach((r, idx) => {
          r.rotation.z += 0.001 * (idx + 1);
          r.rotation.y += 0.0005;
        });
      }

      if (cameraRef.current) {
        // Dynamic Momentum-based Zoom
        targetZoom.current += zoomVelocity.current;
        zoomVelocity.current *= ZOOM_DAMPING;
        targetZoom.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom.current));

        const currentZ = cameraRef.current.position.z;
        const deltaZ = targetZoom.current - currentZ;
        // Apply smoother spring lerping
        cameraRef.current.position.z += deltaZ * LERP_FACTOR;

        const displayAlt = Math.round(cameraRef.current.position.z * 1000);
        currentAltitudeRef.current = currentAltitudeRef.current + (displayAlt - currentAltitudeRef.current) * 0.15;

        // HUD direct updates
        if (altitudeTextRef.current) altitudeTextRef.current.textContent = `${Math.round(currentAltitudeRef.current)} KM`;
        if (altitudeBarRef.current) {
          const width = ((MAX_ZOOM - (currentAltitudeRef.current / 1000)) / (MAX_ZOOM - MIN_ZOOM)) * 100;
          altitudeBarRef.current.style.width = `${Math.max(0, Math.min(100, width))}%`;
        }
        if (zoomPercentRef.current) {
          const pct = (Math.max(0, (MAX_ZOOM - targetZoom.current) / (MAX_ZOOM - MIN_ZOOM)) * 100).toFixed(0);
          zoomPercentRef.current.innerHTML = `${pct}<span class="text-[12px] opacity-40 ml-1">%</span>`;
        }

        if (mainLightRef.current) {
          mainLightRef.current.position.copy(cameraRef.current.position).add(new THREE.Vector3(2, 2, 0));
        }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate();
  }, []);

  useEffect(() => {
    isComponentMounted.current = true;
    initThree();

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    if (!videoRef.current || !mediaPipeCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = mediaPipeCanvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let handsInstance: any = null;
    let cameraMP: any = null;
    let isHandsClosed = false;

    const onResults = (results: any) => {
      if (!isComponentMounted.current || isHandsClosed) return;
      setLoading(false);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let currentTrackingMode = 'IDLE';

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        lastInteractionTime.current = Date.now();

        // Handling Two-Hand Zoom
        if (results.multiHandLandmarks.length >= 2) {
          currentTrackingMode = 'ZOOM';
          const h1 = results.multiHandLandmarks[0][0];
          const h2 = results.multiHandLandmarks[1][0];
          const rawDist = Math.sqrt(Math.pow(h1.x - h2.x, 2) + Math.pow(h1.y - h2.y, 2));

          // Apply EMA filter to hand distance for super smooth zoom
          if (smoothedHandDistance.current === null) {
            smoothedHandDistance.current = rawDist;
          } else {
            smoothedHandDistance.current = (rawDist * EMA_ALPHA) + (smoothedHandDistance.current * (1 - EMA_ALPHA));
          }

          if (lastHandDistance.current !== null) {
            const distDelta = smoothedHandDistance.current - lastHandDistance.current;
            // Accumulate velocity rather than setting position directly for kinetic feel
            zoomVelocity.current -= (distDelta * ZOOM_SENSITIVITY * 0.1);
          }
          lastHandDistance.current = smoothedHandDistance.current;

          // Midpoint of hands can influence subtle rotation while zooming
          const midX = (h1.x + h2.x) / 2;
          const midY = (h1.y + h2.y) / 2;
          handPos.current = { x: midX, y: midY };
        } else {
          // Single hand for rotation
          currentTrackingMode = 'ROTATION';
          const landmarks = results.multiHandLandmarks[0];
          const palm = landmarks[0];
          handPos.current = { x: palm.x, y: palm.y };
          lastHandDistance.current = null;
          smoothedHandDistance.current = null;

          const index = landmarks[8];
          const thumb = landmarks[4];
          const pDist = Math.sqrt(Math.pow(index.x - thumb.x, 2) + Math.pow(index.y - thumb.y, 2));
          if (pDist < PINCH_THRESHOLD) {
            if (!isPinching.current) {
              isPinching.current = true;
            }
          } else {
            isPinching.current = false;
          }
        }

        if (window.drawConnectors && window.drawLandmarks) {
          results.multiHandLandmarks.forEach((landmarks: any, index: number) => {
            const color = index === 0 ? '#00ffff' : '#ffffff';
            window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: color, lineWidth: 2 });
            window.drawLandmarks(ctx, landmarks, { color: color, lineWidth: 1, radius: 2 });
          });
        }
      } else {
        handPos.current = null;
        lastHandDistance.current = null;
        smoothedHandDistance.current = null;
        currentTrackingMode = 'IDLE';
      }

      // HUD UI status updates
      if (vectorSubsystemTextRef.current) vectorSubsystemTextRef.current.textContent = currentTrackingMode === 'ZOOM' ? 'Dynamic Two-Hand Zoom' : currentTrackingMode === 'ROTATION' ? 'Orbital Tracking' : 'Calibration Mode';
      if (trackingModeTextRef.current) trackingModeTextRef.current.textContent = `Input: ${currentTrackingMode}`;
      if (kineticLinkDotRef.current) {
        kineticLinkDotRef.current.style.backgroundColor = currentTrackingMode !== 'IDLE' ? '#00ffff' : '#333';
        kineticLinkDotRef.current.style.boxShadow = currentTrackingMode !== 'IDLE' ? '0 0 15px #00ffff' : 'none';
      }
    };

    if (window.Hands) {
      handsInstance = new window.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      handsInstance.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
      handsInstance.onResults(onResults);

      if (window.Camera) {
        cameraMP = new window.Camera(video, {
          onFrame: async () => {
            if (isComponentMounted.current && !isHandsClosed && videoRef.current && handsInstance) {
              try { await handsInstance.send({ image: videoRef.current }); } catch (err) { }
            }
          },
          width: 640,
          height: 480,
        });
        cameraMP.start();
      }
    }

    return () => {
      isComponentMounted.current = false;
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (cameraMP) cameraMP.stop();
      if (handsInstance) {
        isHandsClosed = true;
        handsInstance.close();
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (sceneRef.current) {
          sceneRef.current.traverse((object: any) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
              if (Array.isArray(object.material)) object.material.forEach((m: any) => m.dispose());
              else object.material.dispose();
            }
          });
        }
      }
    };
  }, [initThree]);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-[#010303] overflow-hidden text-[#00ffff] font-roboto select-none">
      <canvas ref={threeCanvasRef} id="three-canvas" className="absolute inset-0 z-10" />

      <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center opacity-20 transition-all duration-700">
        <div className="relative w-[500px] h-[500px] border border-[#00ffff]/10 rounded-full flex items-center justify-center">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-16 bg-[#00ffff]/30" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[2px] h-16 bg-[#00ffff]/30" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-[2px] bg-[#00ffff]/30" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-[2px] bg-[#00ffff]/30" />
          <div className="absolute inset-12 border border-[#00ffff]/5 rounded-full border-dashed animate-[spin_120s_linear_infinite]" />
          <div className="absolute inset-0 border border-[#00ffff]/5 rounded-full animate-[spin_180s_linear_infinite_reverse]" />
        </div>
      </div>

      {/* Mini Video Feedback */}
      <div className="absolute top-6 right-6 z-40 w-56 h-44 rounded-3xl border border-[#00ffff]/30 bg-black/60 overflow-hidden shadow-[0_0_30px_rgba(0,255,255,0.1)] backdrop-blur-2xl group transition-all hover:scale-105">
        <video ref={videoRef} className="hidden" />
        <canvas ref={mediaPipeCanvasRef} width={224} height={176} className="w-full h-full opacity-50 group-hover:opacity-80 transition-opacity duration-500" />
        <div className="absolute top-3 right-3 p-1.5 bg-black/70 rounded-xl border border-[#00ffff]/20">
          <Radio className="w-3.5 h-3.5 text-[#00ffff] animate-pulse" />
        </div>
        <div className="absolute bottom-4 left-4 flex flex-col gap-0.5">
          <span className="text-[10px] font-orbitron uppercase tracking-[0.3em] text-white/50">Tactical Node</span>
          <span ref={vectorSubsystemTextRef} className="text-[11px] font-orbitron uppercase text-[#00ffff] font-bold">Initializing...</span>
        </div>
      </div>

      {/* Main Info Panel */}
      <div className="absolute top-1/2 -translate-y-1/2 left-10 z-40 w-[440px] pointer-events-none">
        <div className="flex flex-col gap-8">
          <div className="bg-black/70 p-7 rounded-[2.5rem] border border-white/10 backdrop-blur-3xl animate-fade-in relative overflow-hidden group shadow-2xl">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-[#00ffff] to-transparent" />
            <div className="flex items-center gap-5 mb-6">
              <div className="p-4 bg-[#00ffff]/10 rounded-2xl ring-1 ring-[#00ffff]/30 shadow-[0_0_20px_rgba(0,255,255,0.2)]">
                <Globe className="w-8 h-8 text-[#00ffff]" />
              </div>
              <div>
                <h1 className="text-3xl font-orbitron font-bold tracking-tighter text-white">GENESIS-X</h1>
                <p className="text-[11px] uppercase tracking-[0.4em] text-[#00ffff]/60 font-black">Orbital Surveillance</p>
              </div>
            </div>
            <div className="space-y-5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-2 text-white/40 uppercase tracking-widest"><Activity className="w-3.5 h-3.5" /> Relative Altitude</span>
                <span ref={altitudeTextRef} className="text-[#00ffff] font-bold tracking-[0.2em] text-sm">3500 KM</span>
              </div>
              <div className="h-[3px] w-full bg-[#00ffff]/5 relative overflow-hidden rounded-full">
                <div ref={altitudeBarRef} className="absolute top-0 left-0 h-full bg-[#00ffff] shadow-[0_0_10px_#00ffff]" style={{ width: '0%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Legend HUD */}
      <div className="absolute bottom-24 right-12 z-40 flex flex-col items-end gap-8">
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2.5 text-[#00ffff] mb-2">
            <Maximize2 className="w-5 h-5" />
            <span className="text-[12px] font-orbitron font-black uppercase tracking-[0.3em]">Surface Resolution</span>
          </div>
          <div ref={zoomPercentRef} className="text-4xl font-orbitron font-bold text-white leading-none drop-shadow-md">
            0<span className="text-[14px] opacity-40 ml-1.5">%</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 items-end">
          {[...Array(12)].map((_, i) => {
            return (
              <div key={i}
                className="h-1.5 rounded-full transition-all duration-700 bg-[#00ffff]/20 w-12"
                style={{ width: `${100 - (i * 4)}%`, opacity: 0.1 + (i * 0.08) }} />
            );
          })}
        </div>

        <div className="mt-4 p-5 border border-[#00ffff]/20 rounded-[2rem] bg-black/70 backdrop-blur-3xl shadow-2xl min-w-[240px]">
          <div className="text-[10px] text-[#00ffff]/40 uppercase font-black tracking-[0.3em] mb-4">Tactical Status</div>
          <div className="flex items-center gap-4">
            <div ref={kineticLinkDotRef} className="w-3.5 h-3.5 rounded-full bg-white/10 transition-all duration-300" />
            <span ref={trackingModeTextRef} className="text-xs text-white/90 font-mono tracking-tight font-bold">Input: IDLE</span>
          </div>
        </div>
      </div>

      {/* Bottom Main Navigation Controls */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-40 flex items-center gap-16 bg-black/80 px-20 py-7 rounded-full border border-white/10 backdrop-blur-3xl shadow-[0_0_100px_rgba(0,0,0,1)] border-b-2 border-b-[#00ffff]/20">
        <div className="flex flex-col items-center gap-2.5 opacity-40 hover:opacity-100 transition-opacity cursor-help">
          <Database className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-[0.3em] font-black">Storage</span>
        </div>
        <div className="h-12 w-[2px] bg-white/10" />
        <div className="flex flex-col items-center gap-4 w-72">
          <p className="text-[11px] uppercase tracking-[0.6em] font-black text-gray-600 transition-all duration-500">
            SYSTEM ONLINE
          </p>
          <div className="flex gap-2 w-full justify-center">
            {[...Array(14)].map((_, i) => (
              <div key={i} className="h-2 rounded-full transition-all duration-700 bg-white/10 w-2.5" style={{ animationDelay: `${i * 80}ms`, opacity: 1 - (i * 0.04) }} />
            ))}
          </div>
        </div>
        <div className="h-12 w-[2px] bg-white/10" />
        <div className="flex flex-col items-center gap-2.5 opacity-40 hover:opacity-100 transition-opacity cursor-help">
          <Cpu className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-[0.3em] font-black">Process</span>
        </div>
      </div>

      {/* Global Background Grid Overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.06]"
        style={{ backgroundImage: 'radial-gradient(#00ffff 1.5px, transparent 1.5px)', backgroundSize: '60px 60px' }} />

      {loading && (
        <div className="absolute inset-0 z-[100] bg-[#010303] flex flex-col items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full border-4 border-[#00ffff]/10 scale-150" />
            <Loader2 className="w-32 h-32 text-[#00ffff] animate-spin-slow opacity-20" />
            <Globe className="absolute inset-0 m-auto w-14 h-14 text-[#00ffff] animate-pulse" />
          </div>
          <h2 className="mt-14 font-orbitron text-3xl tracking-[1.5em] text-[#00ffff] animate-pulse font-bold ml-6">BOOTING GENESIS</h2>
          <div className="mt-8 flex gap-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-3 h-1 bg-[#00ffff] animate-bounce" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        </div>
      )}

      <style>{`
        .animate-spin-slow { animation: spin 15s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .font-orbitron { font-family: 'Orbitron', sans-serif; }
      `}</style>
    </div>
  );
};

export default HolographicGlobe;