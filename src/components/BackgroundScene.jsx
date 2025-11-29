import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function Particles({ count = 5000 }) {
  const mesh = useRef()
  const light = useRef()

  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100
      const factor = 20 + Math.random() * 100
      const speed = 0.01 + Math.random() / 200
      const xFactor = -50 + Math.random() * 100
      const yFactor = -50 + Math.random() * 100
      const zFactor = -50 + Math.random() * 100
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 })
    }
    return temp
  }, [count])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((state) => {
    particles.forEach((particle, i) => {
      let { t, factor, speed, xFactor, yFactor, zFactor } = particle
      t = particle.t += speed / 2
      const a = Math.cos(t) + Math.sin(t * 1) / 10
      const b = Math.sin(t) + Math.cos(t * 2) / 10
      const s = Math.cos(t)
      
      dummy.position.set(
        (particle.mx / 10) * a + xFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 1) * factor) / 10,
        (particle.my / 10) * b + yFactor + Math.sin((t / 10) * factor) + (Math.cos(t * 2) * factor) / 10,
        (particle.my / 10) * b + zFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 3) * factor) / 10
      )
      dummy.scale.set(s, s, s)
      dummy.rotation.set(s * 5, s * 5, s * 5)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true

    // Rotate light
    if (light.current) {
      light.current.position.x = Math.sin(state.clock.elapsedTime * 0.5) * 30
      light.current.position.z = Math.cos(state.clock.elapsedTime * 0.5) * 30
    }
  })

  return (
    <>
      <pointLight ref={light} distance={40} intensity={8} color="#00D9FF" />
      <instancedMesh ref={mesh} args={[null, null, count]}>
        <dodecahedronGeometry args={[0.2, 0]} />
        <meshPhongMaterial color="#8B5CF6" />
      </instancedMesh>
    </>
  )
}

function FloatingGeometry() {
  const mesh = useRef()

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2
      mesh.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.3
      mesh.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 2
    }
  })

  return (
    <mesh ref={mesh} position={[0, 0, -5]}>
      <torusKnotGeometry args={[3, 1, 256, 32]} />
      <meshStandardMaterial
        color="#151B36"
        wireframe
        transparent
        opacity={0.1}
      />
    </mesh>
  )
}

export default function BackgroundScene() {
  return (
    <>
      <color attach="background" args={['#0A0E27']} />
      <fog attach="fog" args={['#0A0E27', 50, 100]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#00D9FF" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8B5CF6" />
      <Particles count={3000} />
      <FloatingGeometry />
    </>
  )
}
