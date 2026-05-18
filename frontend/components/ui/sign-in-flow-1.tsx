"use client"

import type React from "react"
import { useState, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

type Uniforms = {
  [key: string]: {
    value: number[] | number[][] | number
    type: string
  }
}

interface ShaderProps {
  source: string
  uniforms: {
    [key: string]: {
      value: number[] | number[][] | number
      type: string
    }
  }
  maxFps?: number
}

interface SignInPageProps {
  className?: string
  mode?: "signin" | "signup"
  onSuccessHref?: string
}

export const CanvasRevealEffect = ({
  animationSpeed = 10,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  dotSize,
  showGradient = true,
  reverse = false,
}: {
  animationSpeed?: number
  opacities?: number[]
  colors?: number[][]
  containerClassName?: string
  dotSize?: number
  showGradient?: boolean
  reverse?: boolean
}) => {
  return (
    <div className={cn("h-full relative w-full", containerClassName)}>
      <div className="h-full w-full">
        <DotMatrix
          colors={colors ?? [[0, 255, 255]]}
          dotSize={dotSize ?? 3}
          opacities={opacities ?? [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1]}
          shader={`
            ${reverse ? "u_reverse_active" : "false"}_;
            animation_speed_factor_${animationSpeed.toFixed(1)}_;
          `}
          center={["x", "y"]}
        />
      </div>
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  )
}

interface DotMatrixProps {
  colors?: number[][]
  opacities?: number[]
  totalSize?: number
  dotSize?: number
  shader?: string
  center?: ("x" | "y")[]
}

const DotMatrix: React.FC<DotMatrixProps> = ({
  colors = [[0, 0, 0]],
  opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14],
  totalSize = 20,
  dotSize = 2,
  shader = "",
  center = ["x", "y"],
}) => {
  const uniforms = useMemo(() => {
    let colorsArray = [colors[0], colors[0], colors[0], colors[0], colors[0], colors[0]]
    if (colors.length === 2) {
      colorsArray = [colors[0], colors[0], colors[0], colors[1], colors[1], colors[1]]
    } else if (colors.length === 3) {
      colorsArray = [colors[0], colors[0], colors[1], colors[1], colors[2], colors[2]]
    }
    return {
      u_colors: {
        value: colorsArray.map((color) => [color[0] / 255, color[1] / 255, color[2] / 255]),
        type: "uniform3fv",
      },
      u_opacities: {
        value: opacities,
        type: "uniform1fv",
      },
      u_total_size: {
        value: totalSize,
        type: "uniform1f",
      },
      u_dot_size: {
        value: dotSize,
        type: "uniform1f",
      },
      u_reverse: {
        value: shader.includes("u_reverse_active") ? 1 : 0,
        type: "uniform1i",
      },
    }
  }, [colors, opacities, totalSize, dotSize, shader])

  return (
    <Shader
      source={`
        precision mediump float;
        in vec2 fragCoord;

        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;

        out vec4 fragColor;

        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) {
            return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
        }
        float map(float value, float min1, float max1, float min2, float max2) {
            return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
        }

        void main() {
            vec2 st = fragCoord.xy;
            ${
              center.includes("x")
                ? "st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));"
                : ""
            }
            ${
              center.includes("y")
                ? "st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));"
                : ""
            }

            float opacity = step(0.0, st.x);
            opacity *= step(0.0, st.y);

            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

            float frequency = 5.0;
            float show_offset = random(st2);
            float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

            vec3 color = u_colors[int(show_offset * 6.0)];

            float animation_speed_factor = 0.5;
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);

            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);

            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);

            float current_timing_offset;
            if (u_reverse == 1) {
                current_timing_offset = timing_offset_outro;
                opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                current_timing_offset = timing_offset_intro;
                opacity *= step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }

            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a;
        }`}
      uniforms={uniforms}
      maxFps={60}
    />
  )
}

const ShaderMaterial = ({
  source,
  uniforms,
  maxFps = 60,
}: {
  source: string
  hovered?: boolean
  maxFps?: number
  uniforms: Uniforms
}) => {
  const { size } = useThree()
  const ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const timestamp = clock.getElapsedTime()
    const material = ref.current.material as THREE.ShaderMaterial
    const timeLocation = material.uniforms.u_time
    timeLocation.value = timestamp
  })

  const getUniforms = () => {
    const preparedUniforms: Record<string, { value: unknown; type: string }> = {}

    for (const uniformName in uniforms) {
      const uniform = uniforms[uniformName] as { value: unknown; type: string }

      switch (uniform.type) {
        case "uniform1f":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1f" }
          break
        case "uniform1i":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1i" }
          break
        case "uniform3f":
          preparedUniforms[uniformName] = {
            value: new THREE.Vector3().fromArray(uniform.value as number[]),
            type: "3f",
          }
          break
        case "uniform1fv":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1fv" }
          break
        case "uniform3fv":
          preparedUniforms[uniformName] = {
            value: (uniform.value as number[][]).map((v) => new THREE.Vector3().fromArray(v)),
            type: "3fv",
          }
          break
        case "uniform2f":
          preparedUniforms[uniformName] = {
            value: new THREE.Vector2().fromArray(uniform.value as number[]),
            type: "2f",
          }
          break
        default:
          console.error(`Invalid uniform type for '${uniformName}'.`)
          break
      }
    }

    preparedUniforms["u_time"] = { value: 0, type: "1f" }
    preparedUniforms["u_resolution"] = {
      value: new THREE.Vector2(size.width * 2, size.height * 2),
      type: "2f",
    }
    return preparedUniforms
  }

  const material = useMemo(() => {
    const materialObject = new THREE.ShaderMaterial({
      vertexShader: `
      precision mediump float;
      in vec2 coordinates;
      uniform vec2 u_resolution;
      out vec2 fragCoord;
      void main(){
        float x = position.x;
        float y = position.y;
        gl_Position = vec4(x, y, 0.0, 1.0);
        fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
        fragCoord.y = u_resolution.y - fragCoord.y;
      }
      `,
      fragmentShader: source,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      uniforms: getUniforms() as any,
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    })

    return materialObject
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, source])

  return (
    <mesh ref={ref}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

const Shader: React.FC<ShaderProps> = ({ source, uniforms, maxFps = 60 }) => {
  return (
    <Canvas className="absolute inset-0 h-full w-full">
      <ShaderMaterial source={source} uniforms={uniforms} maxFps={maxFps} />
    </Canvas>
  )
}

export const SignInPage = ({
  className,
  mode = "signin",
  onSuccessHref = "/dashboard",
}: SignInPageProps) => {
  const [email, setEmail] = useState("")
  const [step, setStep] = useState<"email" | "sent" | "success">("email")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true)
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false)

  // Dynamic import to avoid SSR issues with useAuth
  const [auth, setAuth] = useState<{
    signInWithMagicLink: (email: string) => Promise<{ error: any }>
    signInWithOAuth: (provider: any) => Promise<{ error: any }>
    isAuthenticated: boolean
  } | null>(null)

  useEffect(() => {
    import("@/components/auth/auth-provider").then(({ useAuth }) => {
      // We need to access the context from within a component that's inside the provider
      // So we'll use the supabase client directly here instead
    }).catch(() => {})
  }, [])

  // Use supabase client directly for auth operations on this page
  const [supabaseClient, setSupabaseClient] = useState<any>(null)
  useEffect(() => {
    import("@/lib/supabase/client").then(({ getSupabaseClient }) => {
      const client = getSupabaseClient()
      setSupabaseClient(client)
      client.auth.getSession().then(({ data }) => {
        if (data?.session) {
          window.location.href = onSuccessHref
        }
      })
    }).catch(() => {})
  }, [onSuccessHref])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !supabaseClient) return

    setIsSubmitting(true)
    setError(null)

    try {
      const { error: authError } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (authError) {
        setError(authError.message)
        setIsSubmitting(false)
        return
      }

      // Success - show "check your email" step
      setReverseCanvasVisible(true)
      setTimeout(() => {
        setInitialCanvasVisible(false)
      }, 50)
      setTimeout(() => {
        setStep("sent")
      }, 1500)
    } catch (err) {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (!supabaseClient) return

    setIsSubmitting(true)
    setError(null)

    try {
      const { error: authError } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      })

      if (authError) {
        setError(authError.message)
      }
    } catch (err) {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBackClick = () => {
    setStep("email")
    setError(null)
    setReverseCanvasVisible(false)
    setInitialCanvasVisible(true)
  }

  const headlineText =
    mode === "signup" ? "Create your account" : "Welcome back"
  const subText =
    mode === "signup"
      ? "Sign up to start automating your FTTH workflows"
      : "Sign in to continue to your dashboard"

  return (
    <div
      className={cn(
        "flex w-full flex-col min-h-screen bg-background relative",
        className,
      )}
    >
      <div className="absolute inset-0 z-0">
        {initialCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={3}
              containerClassName="bg-background"
              colors={[
                [120, 220, 255],
                [180, 230, 255],
              ]}
              dotSize={6}
              reverse={false}
            />
          </div>
        )}

        {reverseCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={4}
              containerClassName="bg-background"
              colors={[
                [120, 220, 255],
                [180, 230, 255],
              ]}
              dotSize={6}
              reverse={true}
            />
          </div>
        )}

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,1)_0%,_transparent_100%)]" />
        <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-background to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex-1 flex flex-col justify-center items-center px-6">
            <div className="w-full max-w-sm py-24">
              <AnimatePresence mode="wait">
                {step === "email" ? (
                  <motion.div
                    key="email-step"
                    initial={{ opacity: 0, x: -100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-2">
                      <h1 className="text-[2.25rem] font-semibold leading-[1.1] tracking-tight text-foreground text-balance">
                        {headlineText}
                      </h1>
                      <p className="text-base text-muted-foreground font-light">
                        {subText}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isSubmitting}
                        className="backdrop-blur-[2px] w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-foreground border border-white/10 rounded-full py-3 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                          />
                          <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                          />
                          <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                          />
                          <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                          />
                        </svg>
                        <span>
                          {isSubmitting
                            ? "Connecting..."
                            : mode === "signup"
                              ? "Sign up with Google"
                              : "Sign in with Google"}
                        </span>
                      </button>

                      <div className="flex items-center gap-4">
                        <div className="h-px bg-white/10 flex-1" />
                        <span className="text-muted-foreground text-sm">or</span>
                        <div className="h-px bg-white/10 flex-1" />
                      </div>

                      <form onSubmit={handleEmailSubmit}>
                        <div className="relative">
                          <input
                            type="email"
                            placeholder="you@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isSubmitting}
                            className="w-full backdrop-blur-[1px] text-foreground border border-white/10 rounded-full py-3 px-4 focus:outline-none focus:border-white/30 text-center bg-transparent disabled:opacity-50"
                            required
                          />
                          <button
                            type="submit"
                            aria-label="Continue"
                            disabled={isSubmitting}
                            className="absolute right-1.5 top-1.5 text-foreground w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors group overflow-hidden disabled:opacity-50"
                          >
                            {isSubmitting ? (
                              <span className="h-4 w-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                            ) : (
                              <span className="relative w-full h-full block overflow-hidden">
                                <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-full">
                                  {"â†’"}
                                </span>
                                <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 -translate-x-full group-hover:translate-x-0">
                                  {"â†’"}
                                </span>
                              </span>
                            )}
                          </button>
                        </div>
                      </form>

                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-red-400"
                        >
                          {error}
                        </motion.p>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground pt-6">
                      {"By continuing, you agree to our "}
                      <Link
                        href="/terms"
                        className="underline hover:text-foreground transition-colors"
                      >
                        Terms
                      </Link>
                      {" and "}
                      <Link
                        href="/privacy"
                        className="underline hover:text-foreground transition-colors"
                      >
                        Privacy Policy
                      </Link>
                      .
                    </p>
                  </motion.div>
                ) : step === "sent" ? (
                  <motion.div
                    key="sent-step"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-2">
                      <h1 className="text-[2.25rem] font-semibold leading-[1.1] tracking-tight text-foreground text-balance">
                        Check your email
                      </h1>
                      <p className="text-base text-muted-foreground font-light">
                        We sent a magic link to{" "}
                        <span className="text-foreground font-medium">{email}</span>
                      </p>
                    </div>

                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                      className="py-8"
                    >
                      <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-7 w-7 text-primary"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect width="20" height="16" x="2" y="4" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                      </div>
                    </motion.div>

                    <p className="text-sm text-muted-foreground">
                      Click the link in the email to sign in. The link will expire in 1 hour.
                    </p>

                    <div className="flex w-full gap-3 pt-2">
                      <motion.button
                        type="button"
                        onClick={handleBackClick}
                        className="rounded-full bg-foreground text-background font-medium px-8 py-3 hover:bg-foreground/90 transition-colors w-[40%]"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                      >
                        Back
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={handleEmailSubmit as any}
                        className="flex-1 rounded-full font-medium py-3 border border-white/10 bg-white/5 text-foreground hover:bg-white/10 transition-colors"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                      >
                        Resend link
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="success-step"
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-2">
                      <h1 className="text-[2.25rem] font-semibold leading-[1.1] tracking-tight text-foreground">
                        {"You're in!"}
                      </h1>
                      <p className="text-base text-muted-foreground font-light">
                        Welcome to FTTH Tool
                      </p>
                    </div>

                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                      className="py-8"
                    >
                      <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center glow-cyan">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-8 w-8 text-background"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                    >
                      <Link
                        href={onSuccessHref}
                        className="inline-flex w-full justify-center rounded-full bg-foreground text-background font-medium py-3 hover:bg-foreground/90 transition-colors"
                      >
                        Continue to Dashboard
                      </Link>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
