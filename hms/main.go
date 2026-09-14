package main

import (
	"fmt"
	"hms/config"
	"hms/routes"
	"hms/workers"
	"log"
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found; relying on environment variables")
	}
	if strings.TrimSpace(os.Getenv("GIN_MODE")) == "" {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(strings.TrimSpace(os.Getenv("GIN_MODE")))
	}

	config.ConnectDB()
	config.ConnectRedis()
	
	// Initialize and start background workers
	workers.InitAsynqClient()
	go workers.StartWorkerServer()
	
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	// restrict trusted proxies to local addresses to avoid Gin warning
	_ = r.SetTrustedProxies([]string{"127.0.0.1", "::1"})
	// enable CORS for local frontend and accept preflight
	corsEnv := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	var allowOrigins []string
	if corsEnv != "" {
		allowOrigins = strings.Split(corsEnv, ",")
		for i := range allowOrigins {
			allowOrigins[i] = strings.TrimSpace(allowOrigins[i])
		}
	} else {
		allowOrigins = []string{"http://localhost:5173", "http://localhost:3000", "http://localhost:8080"}
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// global OPTIONS handler to ensure preflight requests always succeed
	r.Use(func(c *gin.Context) {
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})
	// serve uploaded files from UPLOAD_BASE_PATH (defaults to ./uploads)
	uploadBasePath := strings.TrimRight(strings.TrimSpace(os.Getenv("UPLOAD_BASE_PATH")), "/\\")
	if uploadBasePath == "" {
		uploadBasePath = "./uploads"
	}
	_ = os.MkdirAll(uploadBasePath+"/hotels", 0755)
	r.Static("/uploads", uploadBasePath)
	// serve frontend static build under /web (Vite builds to hms_rect/dist)
	if _, err := os.Stat("./hms_rect/dist/index.html"); err == nil {
		r.Static("/web", "./hms_rect/dist")
		// SPA fallback: any non-API /web/* route should return index.html
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if strings.HasPrefix(path, "/web") {
				c.File("./hms_rect/dist/index.html")
				return
			}
			c.Next()
		})
	}
	routes.RegisterRoutes(r)

	// Backward-compatible API versioning aliases.
	// Gin middleware runs after route matching, so forward /api/v1/* explicitly.
	r.Any("/api/v1", func(c *gin.Context) {
		c.Request.URL.Path = "/api"
		r.HandleContext(c)
	})
	r.Any("/api/v1/*any", func(c *gin.Context) {
		target := strings.TrimPrefix(c.Param("any"), "/")
		c.Request.URL.Path = "/api/" + target
		r.HandleContext(c)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := fmt.Sprintf(":%s", port)
	log.Printf("Server is running and listening on port %s\n", port)
	r.Run(addr)
}
