package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"path/filepath"

	"hms/config"

	"github.com/joho/godotenv"
)

func main() {
	// load .env if present
	_ = godotenv.Load()

	// connect DB (without running AutoMigrate)
	config.ConnectDBNoAutoMigrate()
	db := config.DB
	if db == nil {
		log.Fatal("DB not configured")
	}

	migrationsDir := "migrations"
	files, err := ioutil.ReadDir(migrationsDir)
	if err != nil {
		log.Fatalf("Failed to read migrations dir: %v", err)
	}

	for _, f := range files {
		if f.IsDir() {
			continue
		}
		// only .sql files
		if filepath.Ext(f.Name()) != ".sql" {
			continue
		}
		path := filepath.Join(migrationsDir, f.Name())
		fmt.Printf("Applying migration: %s\n", path)
		content, err := ioutil.ReadFile(path)
		if err != nil {
			log.Fatalf("Failed to read %s: %v", path, err)
		}
		if err := db.Exec(string(content)).Error; err != nil {
			log.Fatalf("Failed to execute migration %s: %v", path, err)
		}
		fmt.Printf("Applied: %s\n", f.Name())
	}

	fmt.Println("Migrations applied successfully.")
}
