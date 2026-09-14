package main

import (
	"fmt"
	"log"
	"os"

	"hms/config"
	"hms/models"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// load .env if present
	_ = godotenv.Load()

	// connect DB
	config.ConnectDB()
	db := config.DB
	if db == nil {
		log.Fatal("DB not configured")
	}

	// defaults
	username := "pallab@gmail.com"
	password := "1234"
	if len(os.Args) > 1 {
		username = os.Args[1]
	}
	if len(os.Args) > 2 {
		password = os.Args[2]
	}

	// hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	var admin models.Admin
	if err := db.First(&admin, "username = ?", username).Error; err == nil {
		// update existing admin password
		admin.PasswordHash = string(hash)
		if err := db.Save(&admin).Error; err != nil {
			log.Fatalf("Failed to update admin: %v", err)
		}
		fmt.Printf("Updated admin '%s' (id=%d)\n", username, admin.ID)
		return
	}

	// create new admin
	admin = models.Admin{
		Username:     username,
		PasswordHash: string(hash),
	}
	if err := db.Create(&admin).Error; err != nil {
		log.Fatalf("Failed to create admin: %v", err)
	}
	fmt.Printf("Created admin '%s' (id=%d)\n", username, admin.ID)
}
