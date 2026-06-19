import * as THREE from 'three'

const ARMOR_DARK = '#222633'
const ARMOR_MID = '#394050'
const ARMOR_LIGHT = '#8b929b'
const ARMOR_EDGE = '#b77a67'
const CLOTH_DARK = '#16192a'
const CLOTH_RED = '#7f2430'
const PLUME_RED = '#b71f35'
const PLUME_DARK = '#701420'
const LEATHER = '#5a3520'
const LEATHER_DARK = '#2f1b12'
const BLADE = '#cbd2d9'
const BLADE_EDGE = '#f0f3f6'
const SHIELD_FIELD = '#252934'
const HERALD_GOLD = '#d6aa44'
const VISOR = '#11131a'

const FOOT_Y = 0.08
const SHIN_Y = 0.36
const THIGH_Y = 0.84
const HIP_Y = 1.09
const CHEST_Y = 1.48
const HEAD_Y = 2.08

const mat = (color: string, roughness = 0.72, metalness = 0.15) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true })

const armorDarkMat = mat(ARMOR_DARK, 0.58, 0.45)
const armorMidMat = mat(ARMOR_MID, 0.55, 0.55)
const armorLightMat = mat(ARMOR_LIGHT, 0.42, 0.78)
const armorEdgeMat = mat(ARMOR_EDGE, 0.46, 0.55)
const clothDarkMat = mat(CLOTH_DARK, 0.9, 0)
const clothRedMat = mat(CLOTH_RED, 0.88, 0)
const plumeMat = mat(PLUME_RED, 0.84, 0)
const plumeDarkMat = mat(PLUME_DARK, 0.9, 0)
const leatherMat = mat(LEATHER, 0.82, 0)
const leatherDarkMat = mat(LEATHER_DARK, 0.9, 0)
const bladeMat = mat(BLADE, 0.32, 0.88)
const bladeEdgeMat = mat(BLADE_EDGE, 0.24, 0.9)
const shieldFieldMat = mat(SHIELD_FIELD, 0.58, 0.45)
const heraldGoldMat = mat(HERALD_GOLD, 0.48, 0.5)
const visorMat = new THREE.MeshStandardMaterial({ color: VISOR, roughness: 0.35, metalness: 0.25 })

const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
const cyl = (rt: number, rb: number, h: number, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s)
const cone = (r: number, h: number, s = 6) => new THREE.ConeGeometry(r, h, s)
const sphere = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h)

const FOOT_GEO = box(0.23, 0.16, 0.34)
const TOE_GEO = box(0.24, 0.08, 0.2)
const SHIN_GEO = box(0.18, 0.46, 0.2)
const THIGH_GEO = box(0.22, 0.42, 0.24)
const KNEE_GEO = sphere(0.14, 8, 6)
const HIP_GEO = box(0.62, 0.18, 0.34)
const CHEST_GEO = box(0.76, 0.74, 0.42)
const CHEST_PLATE_GEO = box(0.6, 0.5, 0.045)
const ABDOMEN_GEO = box(0.46, 0.28, 0.36)
const TRIM_LONG_GEO = box(0.055, 0.76, 0.05)
const TRIM_SHORT_GEO = box(0.68, 0.055, 0.05)
const PAULDRON_GEO = sphere(0.24, 8, 6)
const ARM_UPPER_GEO = box(0.19, 0.44, 0.22)
const ARM_LOWER_GEO = box(0.17, 0.4, 0.2)
const HAND_GEO = sphere(0.085, 8, 6)
const NECK_GEO = cyl(0.09, 0.1, 0.12, 8)
const HELMET_GEO = box(0.42, 0.42, 0.38)
const HELMET_CROWN_GEO = cyl(0.23, 0.2, 0.16, 8)
const VISOR_GEO = box(0.32, 0.1, 0.018)
const VISOR_SLIT_GEO = box(0.055, 0.028, 0.014)
const HELMET_RIDGE_GEO = box(0.055, 0.48, 0.045)
const CHEEK_GUARD_GEO = box(0.09, 0.28, 0.05)
const PLUME_SEG_GEO = sphere(0.12, 7, 5)
const SWORD_GRIP_GEO = cyl(0.035, 0.035, 0.28, 8)
const SWORD_POMMEL_GEO = sphere(0.065, 8, 6)
const SWORD_GUARD_GEO = box(0.42, 0.07, 0.08)
const SWORD_BLADE_GEO = box(0.12, 0.9, 0.035)
const SWORD_EDGE_GEO = box(0.035, 0.86, 0.042)
const SWORD_TIP_GEO = cone(0.07, 0.16, 4)
const STRAP_GEO = box(0.08, 0.9, 0.055)
const BELT_GEO = box(0.7, 0.09, 0.42)
const BUCKLE_GEO = box(0.16, 0.12, 0.055)
const TABARD_GEO = box(0.34, 0.74, 0.035)
const SKIRT_GEO = box(0.28, 0.46, 0.04)

function shieldGeometry(scale = 1, depth = 0.08): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-0.42 * scale, 0.52 * scale)
  shape.lineTo(0.42 * scale, 0.52 * scale)
  shape.lineTo(0.36 * scale, -0.16 * scale)
  shape.lineTo(0, -0.62 * scale)
  shape.lineTo(-0.36 * scale, -0.16 * scale)
  shape.lineTo(-0.42 * scale, 0.52 * scale)

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.018 * scale,
    bevelSize: 0.018 * scale,
    bevelSegments: 1,
  })
  geo.translate(0, 0, -depth / 2)
  geo.computeVertexNormals()
  return geo
}

const SHIELD_RIM_GEO = shieldGeometry(1.04, 0.08)
const SHIELD_FIELD_GEO = shieldGeometry(0.88, 0.035)
const LION_BODY_GEO = box(0.34, 0.12, 0.028)
const LION_HEAD_GEO = sphere(0.095, 8, 6)
const LION_LEG_GEO = box(0.055, 0.2, 0.026)
const LION_TAIL_GEO = new THREE.TorusGeometry(0.13, 0.017, 5, 14, Math.PI * 1.25)
const LION_CROWN_GEO = cone(0.06, 0.1, 5)
const LION_CLAW_GEO = cone(0.025, 0.07, 4)

interface PartProps {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  receiveShadow?: boolean
}

function Part({ geometry, material, position, rotation, scale, receiveShadow = false }: PartProps) {
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow={receiveShadow}
    />
  )
}

interface HeroKnightProps {
  position?: [number, number, number]
  rotation?: number
  scale?: number
}

function Leg({ side }: { side: -1 | 1 }) {
  const x = side * 0.18
  return (
    <group>
      <Part geometry={FOOT_GEO} material={leatherDarkMat} position={[x, FOOT_Y, 0.04]} rotation={[0, side * 0.06, 0]} />
      <Part geometry={TOE_GEO} material={leatherMat} position={[x, 0.055, 0.22]} rotation={[0.05, side * 0.06, 0]} />
      <Part geometry={SHIN_GEO} material={armorMidMat} position={[x, SHIN_Y, 0]} rotation={[0.03, 0, side * 0.03]} />
      <Part geometry={TRIM_SHORT_GEO} material={armorEdgeMat} position={[x, 0.55, 0.11]} scale={[0.32, 0.75, 0.8]} />
      <Part geometry={KNEE_GEO} material={armorLightMat} position={[x, 0.62, 0.08]} scale={[1.05, 0.6, 0.75]} />
      <Part geometry={THIGH_GEO} material={armorDarkMat} position={[x, THIGH_Y, 0]} rotation={[-0.04, 0, side * -0.04]} />
      <Part geometry={TRIM_SHORT_GEO} material={armorEdgeMat} position={[x, 1.0, 0.12]} scale={[0.38, 0.75, 0.8]} />
    </group>
  )
}

function Plume() {
  return (
    <group>
      <Part geometry={PLUME_SEG_GEO} material={plumeDarkMat} position={[0, 2.36, -0.03]} scale={[0.8, 1.05, 0.55]} />
      <Part geometry={PLUME_SEG_GEO} material={plumeMat} position={[0, 2.5, -0.08]} scale={[0.85, 1.25, 0.62]} />
      <Part geometry={PLUME_SEG_GEO} material={plumeMat} position={[0, 2.62, -0.18]} scale={[0.78, 1.15, 0.58]} />
      <Part geometry={PLUME_SEG_GEO} material={plumeDarkMat} position={[0, 2.53, -0.31]} scale={[0.62, 0.9, 0.5]} />
    </group>
  )
}

function Helmet() {
  return (
    <group>
      <Part geometry={NECK_GEO} material={armorDarkMat} position={[0, 1.8, 0]} />
      <Part geometry={HELMET_GEO} material={armorLightMat} position={[0, HEAD_Y, 0]} />
      <Part geometry={HELMET_CROWN_GEO} material={armorLightMat} position={[0, 2.29, 0]} />
      <Part geometry={HELMET_RIDGE_GEO} material={armorEdgeMat} position={[0, 2.2, 0.03]} rotation={[Math.PI / 2, 0, 0]} />
      <Part geometry={VISOR_GEO} material={visorMat} position={[0, 2.07, 0.2]} />
      <Part geometry={VISOR_SLIT_GEO} material={armorDarkMat} position={[-0.1, 2.1, 0.214]} />
      <Part geometry={VISOR_SLIT_GEO} material={armorDarkMat} position={[0.1, 2.1, 0.214]} />
      <Part geometry={VISOR_SLIT_GEO} material={armorDarkMat} position={[0, 2.02, 0.214]} />
      <Part geometry={CHEEK_GUARD_GEO} material={armorMidMat} position={[-0.23, 1.98, 0.12]} rotation={[0, 0.18, 0]} />
      <Part geometry={CHEEK_GUARD_GEO} material={armorMidMat} position={[0.23, 1.98, 0.12]} rotation={[0, -0.18, 0]} />
      <Plume />
    </group>
  )
}

function Torso() {
  return (
    <group>
      <Part geometry={ABDOMEN_GEO} material={armorDarkMat} position={[0, 1.12, 0]} />
      <Part geometry={CHEST_GEO} material={armorMidMat} position={[0, CHEST_Y, 0]} scale={[0.9, 1, 1]} />
      <Part geometry={CHEST_PLATE_GEO} material={clothDarkMat} position={[0, 1.5, 0.235]} />
      <Part geometry={TRIM_LONG_GEO} material={armorEdgeMat} position={[-0.23, 1.51, 0.27]} rotation={[0, 0, -0.32]} />
      <Part geometry={TRIM_LONG_GEO} material={armorEdgeMat} position={[0.23, 1.51, 0.27]} rotation={[0, 0, 0.32]} />
      <Part geometry={TRIM_SHORT_GEO} material={armorEdgeMat} position={[0, 1.78, 0.27]} />
      <Part geometry={TRIM_SHORT_GEO} material={armorEdgeMat} position={[0, 1.24, 0.27]} scale={[0.74, 1, 1]} />
      <Part geometry={STRAP_GEO} material={leatherMat} position={[-0.22, 1.48, 0.29]} rotation={[0, 0, -0.58]} />
      <Part geometry={STRAP_GEO} material={leatherMat} position={[0.22, 1.48, 0.29]} rotation={[0, 0, 0.58]} />
      <Part geometry={HIP_GEO} material={leatherDarkMat} position={[0, HIP_Y, 0]} />
      <Part geometry={BELT_GEO} material={leatherMat} position={[0, 1.12, 0.03]} />
      <Part geometry={BUCKLE_GEO} material={heraldGoldMat} position={[0, 1.12, 0.25]} />
      <Part geometry={TABARD_GEO} material={clothDarkMat} position={[0, 0.73, 0.18]} rotation={[0.08, 0, 0]} />
      <Part geometry={TRIM_LONG_GEO} material={armorEdgeMat} position={[-0.19, 0.73, 0.205]} scale={[0.6, 0.72, 0.6]} />
      <Part geometry={TRIM_LONG_GEO} material={armorEdgeMat} position={[0.19, 0.73, 0.205]} scale={[0.6, 0.72, 0.6]} />
      <Part geometry={SKIRT_GEO} material={clothRedMat} position={[0, 0.73, -0.23]} rotation={[-0.12, 0, 0]} />
    </group>
  )
}

function Arm({ side }: { side: -1 | 1 }) {
  const shieldArm = side === -1
  const x = side * 0.5
  return (
    <group>
      <Part
        geometry={PAULDRON_GEO}
        material={armorMidMat}
        position={[side * 0.48, 1.74, 0.02]}
        rotation={[0, 0, side * -0.22]}
        scale={[1.25, 0.58, 0.9]}
      />
      <Part
        geometry={TRIM_SHORT_GEO}
        material={armorEdgeMat}
        position={[side * 0.49, 1.67, 0.18]}
        rotation={[0, 0, side * -0.16]}
        scale={[0.38, 0.8, 0.5]}
      />
      <Part
        geometry={ARM_UPPER_GEO}
        material={armorDarkMat}
        position={[x, 1.42, shieldArm ? 0.02 : 0.03]}
        rotation={[0, 0, side * (shieldArm ? 0.28 : -0.2)]}
      />
      <Part
        geometry={ARM_LOWER_GEO}
        material={armorMidMat}
        position={[side * (shieldArm ? 0.58 : 0.62), shieldArm ? 1.16 : 1.05, 0.08]}
        rotation={[0.05, 0, side * (shieldArm ? 0.08 : -0.18)]}
      />
      <Part
        geometry={HAND_GEO}
        material={leatherMat}
        position={[side * (shieldArm ? 0.59 : 0.67), shieldArm ? 0.93 : 0.82, 0.12]}
        scale={[0.9, 0.75, 0.9]}
      />
    </group>
  )
}

function Sword() {
  return (
    <group position={[0.78, 0.77, 0.2]} rotation={[0.15, 0, -0.95]}>
      <Part geometry={SWORD_POMMEL_GEO} material={armorEdgeMat} position={[0, 0.17, 0]} />
      <Part geometry={SWORD_GRIP_GEO} material={leatherDarkMat} position={[0, 0.02, 0]} />
      <Part geometry={SWORD_GUARD_GEO} material={armorEdgeMat} position={[0, -0.15, 0]} />
      <Part geometry={SWORD_BLADE_GEO} material={bladeMat} position={[0, -0.65, 0]} />
      <Part geometry={SWORD_EDGE_GEO} material={bladeEdgeMat} position={[-0.055, -0.65, 0.002]} />
      <Part geometry={SWORD_EDGE_GEO} material={bladeEdgeMat} position={[0.055, -0.65, 0.002]} />
      <Part geometry={SWORD_TIP_GEO} material={bladeMat} position={[0, -1.18, 0]} rotation={[Math.PI, 0, Math.PI / 4]} />
    </group>
  )
}

function ShieldLion() {
  return (
    <group position={[0.01, 0.02, 0.085]}>
      <Part geometry={LION_BODY_GEO} material={heraldGoldMat} position={[0, 0.05, 0]} rotation={[0, 0, 0.1]} />
      <Part geometry={LION_HEAD_GEO} material={heraldGoldMat} position={[0.22, 0.18, 0]} scale={[0.9, 1.05, 0.28]} />
      <Part geometry={LION_CROWN_GEO} material={heraldGoldMat} position={[0.25, 0.28, 0]} rotation={[0, 0, -0.2]} />
      <Part geometry={LION_LEG_GEO} material={heraldGoldMat} position={[-0.09, -0.08, 0]} rotation={[0, 0, -0.12]} />
      <Part geometry={LION_LEG_GEO} material={heraldGoldMat} position={[0.09, -0.08, 0]} rotation={[0, 0, 0.16]} />
      <Part geometry={LION_LEG_GEO} material={heraldGoldMat} position={[0.22, 0.02, 0]} rotation={[0, 0, -0.84]} scale={[0.82, 1, 1]} />
      <Part geometry={LION_TAIL_GEO} material={heraldGoldMat} position={[-0.22, 0.15, 0]} rotation={[0, 0, -1.25]} />
      <Part geometry={LION_CLAW_GEO} material={heraldGoldMat} position={[0.25, 0.08, 0]} rotation={[0, 0, -1.65]} />
      <Part geometry={LION_CLAW_GEO} material={heraldGoldMat} position={[-0.1, -0.19, 0]} rotation={[0, 0, Math.PI]} />
      <Part geometry={LION_CLAW_GEO} material={heraldGoldMat} position={[0.1, -0.2, 0]} rotation={[0, 0, Math.PI]} />
    </group>
  )
}

function Shield() {
  return (
    <group position={[-0.72, 1.15, 0.28]} rotation={[0.08, -0.38, 0.08]} scale={[1.05, 1.05, 1.05]}>
      <Part geometry={SHIELD_RIM_GEO} material={armorEdgeMat} />
      <Part geometry={SHIELD_FIELD_GEO} material={shieldFieldMat} position={[0, 0.01, 0.052]} />
      <Part geometry={TRIM_LONG_GEO} material={armorEdgeMat} position={[0, 0.03, 0.085]} scale={[0.6, 1.18, 0.55]} />
      <ShieldLion />
    </group>
  )
}

export function HeroKnight({ position = [0, 0, 0], rotation = 0, scale = 1 }: HeroKnightProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <Leg side={-1} />
      <Leg side={1} />
      <Torso />
      <Arm side={-1} />
      <Arm side={1} />
      <Sword />
      <Shield />
      <Helmet />
    </group>
  )
}
