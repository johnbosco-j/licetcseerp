"use client"

import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, PerspectiveCamera } from '@react-three/drei'
import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'

function WarpStars() {
  const pointsRef = useRef<THREE.Points>(null)
  
  // OPTIMIZED: Reduced from 5000 to 800 stars to save GPU
  const [positions] = useState(() => {
    const pos = new Float32Array(800 * 3)
    for (let i = 0; i < 800; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200
      pos[i * 3 + 1] = (Math.random() - 0.5) * 200
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400
    }
    return pos
  })

  useFrame((state, delta) => {
    if (!pointsRef.current) return
    const posAttribute = pointsRef.current.geometry.attributes.position
    const array = posAttribute.array as Float32Array
    
    for (let i = 0; i < 800; i++) {
      array[i * 3 + 2] += delta * 15 
      if (array[i * 3 + 2] > 20) {
        array[i * 3 + 2] = -380 
        array[i * 3] = (Math.random() - 0.5) * 200 
        array[i * 3 + 1] = (Math.random() - 0.5) * 200
      }
    }
    posAttribute.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#ffffff" transparent opacity={0.6} sizeAttenuation />
    </points>
  )
}

function OrbitingPlanets() {
  const groupRef = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.1
      groupRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.05) * 0.2
    }
  })
  return (
    <group ref={groupRef}>
      <mesh position={[12, 4, -15]}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshStandardMaterial color="#0ea5e9" emissive="#0284c7" emissiveIntensity={0.5} wireframe />
      </mesh>
      <mesh position={[-15, -6, -20]}>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshStandardMaterial color="#f97316" emissive="#c2410c" emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

function HyperTorus() {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const [hovered, setHovered] = useState(false)
  const [clicked, setClicked] = useState(false)

  useEffect(() => {
    const handleDown = () => setClicked(true)
    const handleUp = () => setClicked(false)
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  useFrame((state) => {
    if (!meshRef.current || !matRef.current) return
    const { clock, pointer, viewport } = state
    const t = clock.getElapsedTime()

    meshRef.current.rotation.x = t * 0.4
    meshRef.current.rotation.y = t * 0.8
    meshRef.current.rotation.z = t * 0.2

    const targetX = (pointer.x * viewport.width) / 2
    const targetY = (pointer.y * viewport.height) / 2
    meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetX, 0.1)
    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY, 0.1)

    const targetScale = clicked ? 3.5 : 1.0
    const newScale = THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, 0.15)
    meshRef.current.scale.set(newScale, newScale, newScale)

    if (clicked) {
      matRef.current.color.setHex(0xffffff)
      matRef.current.emissive.setHex(0xffffff)
      matRef.current.emissiveIntensity = 1.5
      matRef.current.wireframe = true
    } else {
      matRef.current.color.setHSL((t * 0.05) % 1, 0.8, 0.6)
      matRef.current.emissive.setHSL((t * 0.05) % 1, 0.9, 0.4)
      matRef.current.emissiveIntensity = hovered ? 1.2 : 0.6
      matRef.current.wireframe = false
    }
  })

  return (
    <mesh ref={meshRef} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <torusGeometry args={[1.5, 0.4, 32, 64]} />
      <meshStandardMaterial ref={matRef} metalness={0.8} roughness={0.2} />
    </mesh>
  )
}

export function Scene3D() {
  return (
    // OPTIMIZED: Capped dpr to [1,1] to significantly boost performance
    <Canvas className="w-full h-full" dpr={[1, 1]}>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={75} />
      <color attach="background" args={['#010308']} />
      <fog attach="fog" args={['#010308', 30, 200]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={2} color="#ffffff" />
      <WarpStars />
      <OrbitingPlanets />
      <HyperTorus />
      <Environment preset="city" />
    </Canvas>
  )
}
